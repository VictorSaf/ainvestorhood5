const sqlite3 = require('sqlite3').verbose();
const path = require('path');

const DB_PATH = process.env.DB_PATH || path.join(__dirname, 'ainvestorhood.db');

class Database {
  constructor() {
    this.db = new sqlite3.Database(DB_PATH);
    this.init();
  }

  init() {
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
      this.db.run(`ALTER TABLE news_articles ADD COLUMN published_at DATETIME`, () => {
        // Ignore error if column already exists
      });

      // Index for faster queries
      this.db.run(`CREATE INDEX IF NOT EXISTS idx_created_at ON news_articles(created_at)`);
      this.db.run(`CREATE INDEX IF NOT EXISTS idx_published_at ON news_articles(published_at)`);
      this.db.run(`CREATE INDEX IF NOT EXISTS idx_content_hash ON news_articles(content_hash)`);
    });
  }

  // Settings methods
  getSetting(key) {
    return new Promise((resolve, reject) => {
      this.db.get('SELECT value FROM settings WHERE key = ?', [key], (err, row) => {
        if (err) reject(err);
        else resolve(row ? row.value : null);
      });
    });
  }

  setSetting(key, value) {
    return new Promise((resolve, reject) => {
      this.db.run(
        'INSERT OR REPLACE INTO settings (key, value, updated_at) VALUES (?, ?, CURRENT_TIMESTAMP)',
        [key, value],
        function(err) {
          if (err) reject(err);
          else resolve(this.lastID);
        }
      );
    });
  }

  // News articles methods
  addArticle(article) {
    return new Promise((resolve, reject) => {
      const { title, summary, instrument_type, instrument_name, recommendation, confidence_score, source_url, content_hash, published_at } = article;
      
      this.db.run(
        `INSERT INTO news_articles 
         (title, summary, instrument_type, instrument_name, recommendation, confidence_score, source_url, content_hash, published_at) 
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        [title, summary, instrument_type, instrument_name, recommendation, confidence_score, source_url, content_hash, published_at],
        function(err) {
          if (err) {
            if (err.code === 'SQLITE_CONSTRAINT_UNIQUE') {
              reject(new Error('Duplicate article'));
            } else {
              reject(err);
            }
          } else {
            resolve(this.lastID);
          }
        }
      );
    });
  }

  getRecentArticles(limit = 50) {
    return new Promise((resolve, reject) => {
      this.db.all(
        `SELECT * FROM news_articles 
         WHERE created_at >= datetime('now', '-3 days')
         ORDER BY COALESCE(published_at, created_at) DESC 
         LIMIT ?`,
        [limit],
        (err, rows) => {
          if (err) reject(err);
          else resolve(rows);
        }
      );
    });
  }

  isDuplicate(contentHash) {
    return new Promise((resolve, reject) => {
      this.db.get(
        'SELECT id FROM news_articles WHERE content_hash = ?',
        [contentHash],
        (err, row) => {
          if (err) reject(err);
          else resolve(!!row);
        }
      );
    });
  }

  cleanOldArticles() {
    return new Promise((resolve, reject) => {
      this.db.run(
        `DELETE FROM news_articles WHERE created_at < datetime('now', '-2 days')`,
        function(err) {
          if (err) reject(err);
          else resolve(this.changes);
        }
      );
    });
  }

  // Clean very old articles more aggressively
  cleanVeryOldArticles() {
    return new Promise((resolve, reject) => {
      this.db.run(
        `DELETE FROM news_articles WHERE created_at < datetime('now', '-6 hours')`,
        function(err) {
          if (err) reject(err);
          else resolve(this.changes);
        }
      );
    });
  }

  close() {
    this.db.close();
  }
}

module.exports = Database;