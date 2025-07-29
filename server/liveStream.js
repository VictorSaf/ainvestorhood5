class LiveStreamService {
  constructor() {
    this.io = null;
    this.connectedClients = new Set();
    this.recentArticles = [];
    this.maxRecentArticles = 50;
  }

  init(io) {
    this.io = io;
    console.log('📡 Live stream service initialized');

    io.on('connection', (socket) => {
      this.connectedClients.add(socket.id);
      console.log(`🔗 Client connected: ${socket.id} (${this.connectedClients.size} total)`);

      // Send recent articles to new client
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

    this.io.emit('collection-progress', {
      ...progress,
      timestamp: new Date().toISOString()
    });
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
  syncArticles(articles) {
    this.recentArticles = articles.slice(0, this.maxRecentArticles);
    
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