const Database = require('better-sqlite3');
const path = require('path');

const DB_PATH = process.env.DB_PATH || path.join(__dirname, 'ainvestorhood.db');

class DatabaseWrapper {
  constructor() {
    this.memoryMode = false;
    this.mem = { settings: new Map(), news: [] };
    try {
      this.db = new Database(DB_PATH);
      // Prefer safe, low-write pragmas
      try {
        this.db.exec(`PRAGMA journal_mode = DELETE; PRAGMA synchronous = OFF; PRAGMA temp_store = MEMORY;`);
      } catch {}
      this.init();
    } catch (err) {
      this.enableMemoryMode('open_failed');
    }
  }

  enableMemoryMode(reason = 'io_error') {
    try { if (this.db) this.db.close(); } catch {}
    this.db = null;
    this.memoryMode = true;
    console.warn(`[DB] Switched to in-memory mode due to ${reason}. Writes will not persist.`);
  }

  init() {
    if (this.memoryMode || !this.db) return; // Skip disk schema when in memory fallback
    // Settings table for configuration
    this.db.exec(`CREATE TABLE IF NOT EXISTS settings (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      key TEXT UNIQUE NOT NULL,
      value TEXT NOT NULL,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
    )`);

    // News articles table
    this.db.exec(`CREATE TABLE IF NOT EXISTS news_articles (
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
    try {
      this.db.exec(`ALTER TABLE news_articles ADD COLUMN published_at DATETIME`);
    } catch (error) {
      // Ignore error if column already exists
    }

    // Index for faster queries
    this.db.exec(`CREATE INDEX IF NOT EXISTS idx_created_at ON news_articles(created_at)`);
    this.db.exec(`CREATE INDEX IF NOT EXISTS idx_published_at ON news_articles(published_at)`);
    this.db.exec(`CREATE INDEX IF NOT EXISTS idx_content_hash ON news_articles(content_hash)`);

    // System metrics time-series (persist last N hours)
    this.db.exec(`CREATE TABLE IF NOT EXISTS system_metrics (
      ts INTEGER PRIMARY KEY,
      cpu_pct INTEGER NOT NULL,
      mem_pct INTEGER NOT NULL,
      gpu_pct INTEGER NOT NULL,
      gpu_mem_pct INTEGER NOT NULL
    )`);
    this.db.exec(`CREATE INDEX IF NOT EXISTS idx_system_metrics_ts ON system_metrics(ts)`);

    // WebSocket metrics time-series
    this.db.exec(`CREATE TABLE IF NOT EXISTS websocket_metrics (
      ts INTEGER PRIMARY KEY,
      active INTEGER NOT NULL,
      total INTEGER NOT NULL,
      msg_sent INTEGER NOT NULL,
      msg_recv INTEGER NOT NULL,
      errors INTEGER NOT NULL
    )`);
    this.db.exec(`CREATE INDEX IF NOT EXISTS idx_websocket_metrics_ts ON websocket_metrics(ts)`);

    // HTTP metrics time-series
    this.db.exec(`CREATE TABLE IF NOT EXISTS http_metrics (
      ts INTEGER PRIMARY KEY,
      active INTEGER NOT NULL,
      total INTEGER NOT NULL,
      errors INTEGER NOT NULL,
      avg_rt INTEGER NOT NULL
    )`);
    this.db.exec(`CREATE INDEX IF NOT EXISTS idx_http_metrics_ts ON http_metrics(ts)`);

    // Database metrics time-series
    this.db.exec(`CREATE TABLE IF NOT EXISTS db_metrics (
      ts INTEGER PRIMARY KEY,
      active INTEGER NOT NULL,
      total INTEGER NOT NULL,
      errors INTEGER NOT NULL,
      avg_ms INTEGER NOT NULL
    )`);
    this.db.exec(`CREATE INDEX IF NOT EXISTS idx_db_metrics_ts ON db_metrics(ts)`);

    // AI metrics time-series
    this.db.exec(`CREATE TABLE IF NOT EXISTS ai_metrics (
      ts INTEGER PRIMARY KEY,
      avg_ms INTEGER NOT NULL,
      total INTEGER NOT NULL,
      errors INTEGER NOT NULL
    )`);
    this.db.exec(`CREATE INDEX IF NOT EXISTS idx_ai_metrics_ts ON ai_metrics(ts)`);

    // Scrapy metrics time-series
    this.db.exec(`CREATE TABLE IF NOT EXISTS scrapy_metrics (
      ts INTEGER PRIMARY KEY,
      last_articles INTEGER NOT NULL,
      status TEXT NOT NULL,
      last_errors INTEGER NOT NULL
    )`);
    this.db.exec(`CREATE INDEX IF NOT EXISTS idx_scrapy_metrics_ts ON scrapy_metrics(ts)`);
  }

  // Settings methods
  getSetting(key) {
    return new Promise((resolve, reject) => {
      try {
        if (this.memoryMode) {
          return resolve(this.mem.settings.has(key) ? this.mem.settings.get(key) : null);
        }
        const stmt = this.db.prepare('SELECT value FROM settings WHERE key = ?');
        const row = stmt.get(key);
        resolve(row ? row.value : null);
      } catch (err) {
        reject(err);
      }
    });
  }

  setSetting(key, value) {
    return new Promise((resolve, reject) => {
      try {
        if (this.memoryMode) {
          this.mem.settings.set(key, value);
          return resolve(1);
        }
        const stmt = this.db.prepare('INSERT OR REPLACE INTO settings (key, value, updated_at) VALUES (?, ?, CURRENT_TIMESTAMP)');
        const result = stmt.run(key, value);
        resolve(result.lastInsertRowid);
      } catch (err) {
        if (String(err.message||'').includes('database or disk is full') || err.code === 'SQLITE_FULL' || err.code === 'SQLITE_IOERR') {
          this.enableMemoryMode(err.code || 'disk_full');
          this.mem.settings.set(key, value);
          return resolve(1);
        }
        reject(err);
      }
    });
  }

  // News articles methods
  addArticle(article) {
    return new Promise((resolve, reject) => {
      try {
        const { title, summary, instrument_type, instrument_name, recommendation, confidence_score, source_url, content_hash, published_at } = article;

        // Enforce valid tradable instrument presence at DB layer as well
        const hasValidInstrumentName = typeof instrument_name === 'string' && instrument_name.trim().length > 0;
        if (!hasValidInstrumentName) {
          return reject(new Error('Invalid instrument: instrument_name is required'));
        }
        if (this.memoryMode) {
          if (this.mem.news.find(n => n.content_hash === content_hash)) return reject(new Error('Duplicate article'));
          this.mem.news.push({ title, summary, instrument_type, instrument_name, recommendation, confidence_score, source_url, content_hash, published_at, created_at: new Date().toISOString() });
          return resolve(this.mem.news.length);
        }
        const stmt = this.db.prepare(`INSERT INTO news_articles 
         (title, summary, instrument_type, instrument_name, recommendation, confidence_score, source_url, content_hash, published_at) 
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`);
        
        const result = stmt.run(title, summary, instrument_type, instrument_name, recommendation, confidence_score, source_url, content_hash, published_at);
        resolve(result.lastInsertRowid);
      } catch (err) {
        if (err.code === 'SQLITE_CONSTRAINT_UNIQUE') {
          reject(new Error('Duplicate article'));
        } else {
          if (String(err.message||'').includes('database or disk is full') || err.code === 'SQLITE_FULL' || err.code === 'SQLITE_IOERR') {
            this.enableMemoryMode(err.code || 'disk_full');
            try {
              if (this.mem.news.find(n => n.content_hash === article.content_hash)) return reject(new Error('Duplicate article'));
              this.mem.news.push({ ...article, created_at: new Date().toISOString() });
              return resolve(this.mem.news.length);
            } catch {}
          }
          reject(err);
        }
      }
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
      try {
        if (this.memoryMode) {
          const rows = this.mem.news
            .filter(r => r.instrument_name && String(r.instrument_name).trim().length > 0)
            .reduce((acc, cur) => { if (!acc.find(a => a.content_hash === cur.content_hash)) acc.push(cur); return acc; }, [])
            .sort((a,b) => new Date(b.published_at||b.created_at) - new Date(a.published_at||a.created_at))
            .slice(0, limit);
          return resolve(rows);
        }
        const stmt = this.db.prepare(`SELECT * FROM news_articles 
         WHERE created_at >= datetime('now', '-3 days')
           AND instrument_name IS NOT NULL AND TRIM(instrument_name) <> ''
         GROUP BY content_hash
         ORDER BY MAX(COALESCE(published_at, created_at)) DESC 
         LIMIT ?`);
        const rows = stmt.all(limit);
        resolve(rows);
      } catch (err) {
        reject(err);
      }
    });
  }

  isDuplicate(contentHash) {
    return new Promise((resolve, reject) => {
      try {
        if (this.memoryMode) {
          return resolve(!!this.mem.news.find(a => a.content_hash === contentHash));
        }
        const stmt = this.db.prepare('SELECT id FROM news_articles WHERE content_hash = ?');
        const row = stmt.get(contentHash);
        resolve(!!row);
      } catch (err) {
        reject(err);
      }
    });
  }

  cleanOldArticles() {
    return new Promise((resolve, reject) => {
      try {
        if (this.memoryMode) {
          const cutoff = Date.now() - 2 * 24 * 60 * 60 * 1000;
          const before = this.mem.news.length;
          this.mem.news = this.mem.news.filter(n => new Date(n.created_at).getTime() >= cutoff);
          return resolve(before - this.mem.news.length);
        }
        const stmt = this.db.prepare(`DELETE FROM news_articles WHERE created_at < datetime('now', '-2 days')`);
        const result = stmt.run();
        resolve(result.changes);
      } catch (err) {
        reject(err);
      }
    });
  }

  // Clean very old articles more aggressively
  cleanVeryOldArticles() {
    return new Promise((resolve, reject) => {
      try {
        if (this.memoryMode) {
          const cutoff = Date.now() - 6 * 60 * 60 * 1000;
          const before = this.mem.news.length;
          this.mem.news = this.mem.news.filter(n => new Date(n.created_at).getTime() >= cutoff);
          return resolve(before - this.mem.news.length);
        }
        const stmt = this.db.prepare(`DELETE FROM news_articles WHERE created_at < datetime('now', '-6 hours')`);
        const result = stmt.run();
        resolve(result.changes);
      } catch (err) {
        reject(err);
      }
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