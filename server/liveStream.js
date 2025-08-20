const Database = require('./database');

class LiveStreamService {
  constructor() {
    this.io = null;
    this.connectedClients = new Set();
    this.recentArticles = [];
    this.maxRecentArticles = 50;
    this.db = null;
    this.currentRun = { processed: 0, duplicates: 0, errors: 0, started: false };
  }

  init(io) {
    this.io = io;
    try { this.db = new Database(); } catch {}
    console.log('📡 Live stream service initialized');

    // Încarcă articolele la inițializare - FORȚAT
    this.loadArticlesFromDatabase();

    io.on('connection', (socket) => {
      this.connectedClients.add(socket.id);
      console.log(`🔗 Client connected: ${socket.id} (${this.connectedClients.size} total)`);

      // Send recent articles to new client
      console.log(`📰 Sending ${this.recentArticles.length} recent articles to new client`);
      socket.emit('initial-articles', this.recentArticles);

      // Handle client requests
      socket.on('request-refresh', () => {
        socket.emit('articles-refresh', this.recentArticles);
      });

      socket.on('disconnect', () => {
        this.connectedClients.delete(socket.id);
        console.log(`❌ Client disconnected: ${socket.id} (${this.connectedClients.size} total)`);
      });
    });
  }

  // Metodă dedicată pentru încărcarea articolelor din baza de date
  async loadArticlesFromDatabase() {
    try {
      const Database = require('./database');
      const db = new Database();
      const dbArticles = await db.getRecentArticles(this.maxRecentArticles);
      this.recentArticles = dbArticles;
      console.log(`📰 LiveStream: FORȚAT loaded ${this.recentArticles.length} articles from database`);
    } catch (error) {
      console.error('Error FORȚAT loading articles for LiveStream:', error);
      this.recentArticles = [];
    }
  }

  // Broadcast new article to all connected clients
  broadcastNewArticle(article) {
    if (!this.io) return;

    console.log(`📡 Broadcasting new article: ${article.title.substring(0, 50)}...`);
    
    // Add to recent articles list
    this.recentArticles.unshift(article);
    
    // Keep only the most recent articles
    if (this.recentArticles.length > this.maxRecentArticles) {
      this.recentArticles = this.recentArticles.slice(0, this.maxRecentArticles);
    }

    // Broadcast to all connected clients
    this.io.emit('new-article', {
      article: article,
      timestamp: new Date().toISOString(),
      totalClients: this.connectedClients.size
    });
  }

  // Broadcast article update (if analysis was refined)
  broadcastArticleUpdate(article) {
    if (!this.io) return;

    console.log(`📡 Broadcasting article update: ${article.title.substring(0, 50)}...`);
    
    // Update in recent articles list
    const index = this.recentArticles.findIndex(a => a.id === article.id);
    if (index !== -1) {
      this.recentArticles[index] = article;
    }

    this.io.emit('article-updated', {
      article: article,
      timestamp: new Date().toISOString()
    });
  }

  // Broadcast system status updates
  broadcastSystemStatus(status) {
    if (!this.io) return;

    this.io.emit('system-status', {
      status: status,
      timestamp: new Date().toISOString(),
      connectedClients: this.connectedClients.size
    });
  }

  // Broadcast news collection progress
  broadcastCollectionProgress(progress) {
    if (!this.io) return;
    // Maintain rolling counters for realtime UI
    if (progress.started) {
      this.currentRun = { processed: 0, duplicates: 0, errors: 0, started: true };
    }
    if (typeof progress.processed === 'number') this.currentRun.processed = progress.processed;
    if (typeof progress.duplicates === 'number') this.currentRun.duplicates = progress.duplicates;
    if (typeof progress.errors === 'number') this.currentRun.errors = progress.errors;
    const payload = {
      processed: this.currentRun.processed,
      duplicates: this.currentRun.duplicates,
      errors: this.currentRun.errors,
      started: this.currentRun.started,
      completed: !!progress.completed,
      timestamp: new Date().toISOString()
    };
    if (payload.completed) {
      this.currentRun.started = false;
    }
    this.io.emit('collection-progress', payload);
  }

  // Get current statistics
  getStats() {
    return {
      connectedClients: this.connectedClients.size,
      recentArticles: this.recentArticles.length,
      isActive: !!this.io
    };
  }

  // Sync articles from database
  async syncArticles(articles) {
    if (articles) {
      this.recentArticles = articles.slice(0, this.maxRecentArticles);
    } else {
      // Dacă nu sunt furnizate articole, încarcă din baza de date
      try {
        const Database = require('./database');
        const db = new Database();
        const dbArticles = await db.getRecentArticles(this.maxRecentArticles);
        this.recentArticles = dbArticles;
        console.log(`📰 LiveStream: Loaded ${this.recentArticles.length} articles from database`);
      } catch (error) {
        console.error('Error loading articles for LiveStream:', error);
        this.recentArticles = [];
      }
    }
    
    if (this.io) {
      this.io.emit('articles-sync', {
        articles: this.recentArticles,
        timestamp: new Date().toISOString()
      });
    }
  }

  // Send typing indicator when processing articles
  broadcastProcessingStatus(status) {
    if (!this.io) return;

    this.io.emit('processing-status', {
      isProcessing: status,
      timestamp: new Date().toISOString()
    });
  }
}

module.exports = new LiveStreamService();