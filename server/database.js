const Database = require('better-sqlite3');
const path = require('path');

const DB_PATH = process.env.DB_PATH || path.join(__dirname, 'ainvestorhood.db');

class DatabaseWrapper {
  constructor() {
    this.db = new Database(DB_PATH);
    this.init();
  }

  init() {
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
  }

  // Settings methods
  getSetting(key) {
    return new Promise((resolve, reject) => {
      try {
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
        const stmt = this.db.prepare('INSERT OR REPLACE INTO settings (key, value, updated_at) VALUES (?, ?, CURRENT_TIMESTAMP)');
        const result = stmt.run(key, value);
        resolve(result.lastInsertRowid);
      } catch (err) {
        reject(err);
      }
    });
  }

  // News articles methods
  addArticle(article) {
    return new Promise((resolve, reject) => {
      try {
        const { title, summary, instrument_type, instrument_name, recommendation, confidence_score, source_url, content_hash, published_at } = article;
        
        const stmt = this.db.prepare(`INSERT INTO news_articles 
         (title, summary, instrument_type, instrument_name, recommendation, confidence_score, source_url, content_hash, published_at) 
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`);
        
        const result = stmt.run(title, summary, instrument_type, instrument_name, recommendation, confidence_score, source_url, content_hash, published_at);
        resolve(result.lastInsertRowid);
      } catch (err) {
        if (err.code === 'SQLITE_CONSTRAINT_UNIQUE') {
          reject(new Error('Duplicate article'));
        } else {
          reject(err);
        }
      }
    });
  }

  getRecentArticles(limit = 50) {
    return new Promise((resolve, reject) => {
      try {
        const stmt = this.db.prepare(`SELECT * FROM news_articles 
         WHERE created_at >= datetime('now', '-3 days')
         ORDER BY COALESCE(published_at, created_at) DESC 
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
        const stmt = this.db.prepare(`DELETE FROM news_articles WHERE created_at < datetime('now', '-6 hours')`);
        const result = stmt.run();
        resolve(result.changes);
      } catch (err) {
        reject(err);
      }
    });
  }

  close() {
    this.db.close();
  }
}

module.exports = DatabaseWrapper;