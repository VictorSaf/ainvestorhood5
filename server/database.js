const sqlite3 = require('sqlite3').verbose();
const path = require('path');

const DB_PATH = process.env.DB_PATH || path.join(__dirname, 'ainvestorhood.db');

class DatabaseWrapper {
  constructor() {
    this.db = new sqlite3.Database(DB_PATH);
    this.init();
  }

  init() {
    return new Promise((resolve, reject) => {
      this.db.serialize(() => {
        // Settings table for configuration
        this.db.run(`CREATE TABLE IF NOT EXISTS settings (
          id INTEGER PRIMARY KEY AUTOINCREMENT,
          key TEXT UNIQUE NOT NULL,
          value TEXT NOT NULL,
          created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
          updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
        )`);

        // News articles table
        this.db.run(`CREATE TABLE IF NOT EXISTS news_articles (
          id INTEGER PRIMARY KEY AUTOINCREMENT,
          title TEXT NOT NULL,
          summary TEXT NOT NULL,
          instrument_type TEXT NOT NULL,
          instrument_name TEXT,
          recommendation TEXT NOT NULL CHECK(recommendation IN ('BUY', 'SELL', 'HOLD')),
          confidence_score INTEGER NOT NULL CHECK(confidence_score >= 1 AND confidence_score <= 100),
          source_url TEXT,
          content_hash TEXT UNIQUE NOT NULL,
          published_at DATETIME,
          created_at DATETIME DEFAULT CURRENT_TIMESTAMP
        )`);

        // Add the published_at column if it doesn't exist (for existing databases)
        this.db.run(`ALTER TABLE news_articles ADD COLUMN published_at DATETIME`, (err) => {
          // Ignore error if column already exists
        });

        // System metrics table for monitoring data
        this.db.run(`CREATE TABLE IF NOT EXISTS system_metrics (
          id INTEGER PRIMARY KEY AUTOINCREMENT,
          cpu_usage REAL NOT NULL,
          memory_usage REAL NOT NULL,
          memory_percentage REAL NOT NULL,
          memory_total INTEGER NOT NULL,
          memory_free INTEGER NOT NULL,
          uptime INTEGER NOT NULL,
          load_average_1 REAL,
          load_average_5 REAL,
          load_average_15 REAL,
          timestamp DATETIME DEFAULT CURRENT_TIMESTAMP,
          created_at DATETIME DEFAULT CURRENT_TIMESTAMP
        )`);

        // Index for faster queries
        this.db.run(`CREATE INDEX IF NOT EXISTS idx_created_at ON news_articles(created_at)`);
        this.db.run(`CREATE INDEX IF NOT EXISTS idx_published_at ON news_articles(published_at)`);
        this.db.run(`CREATE INDEX IF NOT EXISTS idx_content_hash ON news_articles(content_hash)`);
        this.db.run(`CREATE INDEX IF NOT EXISTS idx_system_metrics_timestamp ON system_metrics(timestamp)`, (err) => {
          if (err) {
            reject(err);
          } else {
            resolve();
          }
        });
      });
    });
  }

  // Settings methods
  getSetting(key) {
    return new Promise((resolve, reject) => {
      this.db.get('SELECT value FROM settings WHERE key = ?', [key], (err, row) => {
        if (err) {
          reject(err);
        } else {
          resolve(row ? row.value : null);
        }
      });
    });
  }

  setSetting(key, value) {
    return new Promise((resolve, reject) => {
      this.db.run('INSERT OR REPLACE INTO settings (key, value, updated_at) VALUES (?, ?, CURRENT_TIMESTAMP)', 
        [key, value], function(err) {
        if (err) {
          reject(err);
        } else {
          resolve(this.lastID);
        }
      });
    });
  }

  deleteSetting(key) {
    return new Promise((resolve, reject) => {
      this.db.run('DELETE FROM settings WHERE key = ?', [key], function(err) {
        if (err) {
          reject(err);
        } else {
          resolve(this.changes);
        }
      });
    });
  }

  // News articles methods
  addArticle(article) {
    return new Promise((resolve, reject) => {
      const { title, summary, instrument_type, instrument_name, recommendation, confidence_score, source_url, content_hash, published_at } = article;
      
      this.db.run(`INSERT INTO news_articles 
       (title, summary, instrument_type, instrument_name, recommendation, confidence_score, source_url, content_hash, published_at) 
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`, 
       [title, summary, instrument_type, instrument_name, recommendation, confidence_score, source_url, content_hash, published_at], 
       function(err) {
        if (err) {
          if (err.code === 'SQLITE_CONSTRAINT' && err.message.includes('UNIQUE')) {
            reject(new Error('Duplicate article'));
          } else {
            reject(err);
          }
        } else {
          resolve(this.lastID);
        }
      });
    });
  }

  getArticleById(id) {
    return new Promise((resolve, reject) => {
      try {
        if (this.memoryMode) {
          const row = this.mem.news[id - 1] || null;
          return resolve(row);
        }
        const stmt = this.db.prepare('SELECT * FROM news_articles WHERE id = ?');
        const row = stmt.get(id);
        resolve(row || null);
      } catch (err) {
        reject(err);
      }
    });
  }

  getRecentArticles(limit = 50) {
    return new Promise((resolve, reject) => {
      this.db.all(`SELECT * FROM news_articles 
       WHERE created_at >= datetime('now', '-10 days')
       ORDER BY created_at DESC 
       LIMIT ?`, [limit], (err, rows) => {
        if (err) {
          reject(err);
        } else {
          resolve(rows);
        }
      });
    });
  }

  isDuplicate(contentHash) {
    return new Promise((resolve, reject) => {
      this.db.get('SELECT id FROM news_articles WHERE content_hash = ?', [contentHash], (err, row) => {
        if (err) {
          reject(err);
        } else {
          resolve(!!row);
        }
      });
    });
  }

  cleanOldArticles() {
    return new Promise((resolve, reject) => {
      this.db.run(`DELETE FROM news_articles WHERE created_at < datetime('now', '-2 days')`, function(err) {
        if (err) {
          reject(err);
        } else {
          resolve(this.changes);
        }
      });
    });
  }

  // Clean very old articles more aggressively
  cleanVeryOldArticles() {
    return new Promise((resolve, reject) => {
      this.db.run(`DELETE FROM news_articles WHERE created_at < datetime('now', '-6 hours')`, function(err) {
        if (err) {
          reject(err);
        } else {
          resolve(this.changes);
        }
      });
    });
  }

  // System metrics methods
  saveSystemMetrics(metrics) {
    return new Promise((resolve, reject) => {
      const {
        cpu,
        memory,
        uptime,
        loadAverage
      } = metrics;

      this.db.run(`INSERT INTO system_metrics (
        cpu_usage,
        memory_usage,
        memory_percentage,
        memory_total,
        memory_free,
        uptime,
        load_average_1,
        load_average_5,
        load_average_15,
        timestamp
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, datetime('now'))`, [
        cpu.usage,
        memory.used,
        memory.percentage,
        memory.total,
        memory.free,
        uptime,
        loadAverage[0] || null,
        loadAverage[1] || null,
        loadAverage[2] || null
      ], function(err) {
        if (err) {
          reject(err);
        } else {
          resolve(this.lastID);
        }
      });
    });
  }

  getSystemMetrics(hours = 2) {
    return new Promise((resolve, reject) => {
      this.db.all(`SELECT * FROM system_metrics 
                   WHERE timestamp >= datetime('now', '-${hours} hours')
                   ORDER BY timestamp ASC`, (err, rows) => {
        if (err) {
          reject(err);
        } else {
          resolve(rows);
        }
      });
    });
  }

  getLatestSystemMetrics() {
    return new Promise((resolve, reject) => {
      this.db.get(`SELECT * FROM system_metrics 
                   ORDER BY timestamp DESC 
                   LIMIT 1`, (err, row) => {
        if (err) {
          reject(err);
        } else {
          resolve(row);
        }
      });
    });
  }

  cleanOldSystemMetrics() {
    return new Promise((resolve, reject) => {
      this.db.run(`DELETE FROM system_metrics WHERE timestamp < datetime('now', '-7 days')`, function(err) {
        if (err) {
          reject(err);
        } else {
          resolve(this.changes);
        }
      });
    });
  }

  // -------- System metrics (persisted) --------
  insertSystemMetric(sample) {
    return new Promise((resolve, reject) => {
      try {
        if (this.memoryMode) return resolve(0);
        const { ts, cpu_pct, mem_pct, gpu_pct, gpu_mem_pct } = sample;
        const stmt = this.db.prepare(`INSERT OR REPLACE INTO system_metrics(ts, cpu_pct, mem_pct, gpu_pct, gpu_mem_pct)
          VALUES(?, ?, ?, ?, ?)`);
        const res = stmt.run(ts, cpu_pct|0, mem_pct|0, gpu_pct|0, gpu_mem_pct|0);
        resolve(res.changes);
      } catch (err) {
        if (String(err.message||'').includes('database or disk is full') || err.code === 'SQLITE_FULL' || err.code === 'SQLITE_IOERR') {
          this.enableMemoryMode(err.code || 'disk_full');
          return resolve(0);
        }
        reject(err);
      }
    });
  }

  getSystemMetricsSince(sinceEpochMs) {
    return new Promise((resolve, reject) => {
      try {
        if (this.memoryMode) return resolve([]);
        const stmt = this.db.prepare(`SELECT ts, cpu_pct, mem_pct, gpu_pct, gpu_mem_pct
          FROM system_metrics WHERE ts >= ? ORDER BY ts ASC`);
        const rows = stmt.all(sinceEpochMs);
        resolve(rows);
      } catch (err) {
        reject(err);
      }
    });
  }

  pruneOldSystemMetrics(olderThanEpochMs) {
    return new Promise((resolve, reject) => {
      try {
        if (this.memoryMode) return resolve(0);
        const stmt = this.db.prepare(`DELETE FROM system_metrics WHERE ts < ?`);
        const res = stmt.run(olderThanEpochMs);
        resolve(res.changes);
      } catch (err) {
        reject(err);
      }
    });
  }

  insertWebsocketMetric(sample) {
    return new Promise((resolve, reject) => {
      try {
        if (this.memoryMode) return resolve(0);
        const { ts, active, total, msg_sent, msg_recv, errors } = sample;
        const stmt = this.db.prepare(`INSERT OR REPLACE INTO websocket_metrics(ts, active, total, msg_sent, msg_recv, errors)
          VALUES(?, ?, ?, ?, ?, ?)`);
        const res = stmt.run(ts, active|0, total|0, msg_sent|0, msg_recv|0, errors|0);
        resolve(res.changes);
      } catch (err) {
        if (String(err.message||'').includes('database or disk is full') || err.code === 'SQLITE_FULL' || err.code === 'SQLITE_IOERR') {
          this.enableMemoryMode(err.code || 'disk_full');
          return resolve(0);
        }
        reject(err);
      }
    });
  }

  getWebsocketMetricsSince(sinceEpochMs) {
    return new Promise((resolve, reject) => {
      try {
        if (this.memoryMode) return resolve([]);
        const stmt = this.db.prepare(`SELECT ts, active, total, msg_sent, msg_recv, errors
          FROM websocket_metrics WHERE ts >= ? ORDER BY ts ASC`);
        const rows = stmt.all(sinceEpochMs);
        resolve(rows);
      } catch (err) {
        reject(err);
      }
    });
  }

  pruneOldWebsocketMetrics(olderThanEpochMs) {
    return new Promise((resolve, reject) => {
      try {
        if (this.memoryMode) return resolve(0);
        const stmt = this.db.prepare(`DELETE FROM websocket_metrics WHERE ts < ?`);
        const res = stmt.run(olderThanEpochMs);
        resolve(res.changes);
      } catch (err) {
        reject(err);
      }
    });
  }

  insertHttpMetric(sample) {
    return new Promise((resolve, reject) => {
      try {
        if (this.memoryMode) return resolve(0);
        const { ts, active, total, errors, avg_rt } = sample;
        const stmt = this.db.prepare(`INSERT OR REPLACE INTO http_metrics(ts, active, total, errors, avg_rt) VALUES(?,?,?,?,?)`);
        resolve(stmt.run(ts, active|0, total|0, errors|0, avg_rt|0).changes);
      } catch (e) {
        if (String(e.message||'').includes('database or disk is full') || e.code === 'SQLITE_FULL' || e.code === 'SQLITE_IOERR') {
          this.enableMemoryMode(e.code || 'disk_full');
          return resolve(0);
        }
        reject(e);
      }
    });
  }
  getHttpMetricsSince(since) {
    return new Promise((resolve, reject) => {
      try { if (this.memoryMode) return resolve([]); resolve(this.db.prepare(`SELECT ts, active, total, errors, avg_rt FROM http_metrics WHERE ts>=? ORDER BY ts ASC`).all(since)); } catch (e) { reject(e); }
    });
  }
  pruneOldHttpMetrics(olderThan) {
    return new Promise((resolve, reject) => {
      try { if (this.memoryMode) return resolve(0); resolve(this.db.prepare(`DELETE FROM http_metrics WHERE ts < ?`).run(olderThan).changes); } catch (e) { reject(e); }
    });
  }

  insertDbMetric(sample) {
    return new Promise((resolve, reject) => {
      try {
        if (this.memoryMode) return resolve(0);
        const { ts, active, total, errors, avg_ms } = sample;
        const stmt = this.db.prepare(`INSERT OR REPLACE INTO db_metrics(ts, active, total, errors, avg_ms) VALUES(?,?,?,?,?)`);
        resolve(stmt.run(ts, active|0, total|0, errors|0, avg_ms|0).changes);
      } catch (e) { if (String(e.message||'').includes('database or disk is full') || e.code === 'SQLITE_FULL' || e.code === 'SQLITE_IOERR') { this.enableMemoryMode(e.code||'disk_full'); return resolve(0); } reject(e); }
    });
  }
  getDbMetricsSince(since) {
    return new Promise((resolve, reject) => {
      try { if (this.memoryMode) return resolve([]); resolve(this.db.prepare(`SELECT ts, active, total, errors, avg_ms FROM db_metrics WHERE ts>=? ORDER BY ts ASC`).all(since)); } catch (e) { reject(e); }
    });
  }
  pruneOldDbMetrics(olderThan) {
    return new Promise((resolve, reject) => {
      try { if (this.memoryMode) return resolve(0); resolve(this.db.prepare(`DELETE FROM db_metrics WHERE ts < ?`).run(olderThan).changes); } catch (e) { reject(e); }
    });
  }

  insertAiMetric(sample) {
    return new Promise((resolve, reject) => {
      try {
        if (this.memoryMode) return resolve(0);
        const { ts, avg_ms, total, errors } = sample;
        const stmt = this.db.prepare(`INSERT OR REPLACE INTO ai_metrics(ts, avg_ms, total, errors) VALUES(?,?,?,?)`);
        resolve(stmt.run(ts, avg_ms|0, total|0, errors|0).changes);
      } catch (e) { if (String(e.message||'').includes('database or disk is full') || e.code === 'SQLITE_FULL' || e.code === 'SQLITE_IOERR') { this.enableMemoryMode(e.code||'disk_full'); return resolve(0); } reject(e); }
    });
  }
  getAiMetricsSince(since) {
    return new Promise((resolve, reject) => {
      try { if (this.memoryMode) return resolve([]); resolve(this.db.prepare(`SELECT ts, avg_ms, total, errors FROM ai_metrics WHERE ts>=? ORDER BY ts ASC`).all(since)); } catch (e) { reject(e); }
    });
  }
  pruneOldAiMetrics(olderThan) {
    return new Promise((resolve, reject) => {
      try { if (this.memoryMode) return resolve(0); resolve(this.db.prepare(`DELETE FROM ai_metrics WHERE ts < ?`).run(olderThan).changes); } catch (e) { reject(e); }
    });
  }

  insertScrapyMetric(sample) {
    return new Promise((resolve, reject) => {
      try {
        if (this.memoryMode) return resolve(0);
        const { ts, last_articles, status, last_errors } = sample;
        const stmt = this.db.prepare(`INSERT OR REPLACE INTO scrapy_metrics(ts, last_articles, status, last_errors) VALUES(?,?,?,?)`);
        resolve(stmt.run(ts, last_articles|0, String(status||'idle'), last_errors|0).changes);
      } catch (e) { if (String(e.message||'').includes('database or disk is full') || e.code === 'SQLITE_FULL' || e.code === 'SQLITE_IOERR') { this.enableMemoryMode(e.code||'disk_full'); return resolve(0); } reject(e); }
    });
  }
  getScrapyMetricsSince(since) {
    return new Promise((resolve, reject) => {
      try { if (this.memoryMode) return resolve([]); resolve(this.db.prepare(`SELECT ts, last_articles, status, last_errors FROM scrapy_metrics WHERE ts>=? ORDER BY ts ASC`).all(since)); } catch (e) { reject(e); }
    });
  }
  pruneOldScrapyMetrics(olderThan) {
    return new Promise((resolve, reject) => {
      try { if (this.memoryMode) return resolve(0); resolve(this.db.prepare(`DELETE FROM scrapy_metrics WHERE ts < ?`).run(olderThan).changes); } catch (e) { reject(e); }
    });
  }

  // Delete all news articles
  deleteAllArticles() {
    return new Promise((resolve, reject) => {
      try {
        if (this.memoryMode) { const n = this.mem.news.length; this.mem.news = []; return resolve(n); }
        const stmt = this.db.prepare(`DELETE FROM news_articles`);
        const result = stmt.run();
        resolve(result.changes);
      } catch (err) {
        reject(err);
      }
    });
  }

  close() {
    try { if (this.db) this.db.close(); } catch {}
  }
}

module.exports = DatabaseWrapper;