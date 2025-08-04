class MonitoringService {
  constructor() {
    this.io = null;
    this.stats = {
      backend: {
        status: 'unknown',
        uptime: 0,
        lastActivity: null,
        newsCollection: {
          lastRun: null,
          articlesProcessed: 0,
          duplicatesFound: 0,
          errors: 0,
          activeSources: 0,
          totalSources: 0
        },
        database: {
          status: 'unknown',
          totalArticles: 0,
          lastInsert: null
        },
        api: {
          status: 'unknown',
          lastRequest: null,
          requestCount: 0
        }
      },
      frontend: {
        status: 'unknown',
        connectedClients: 0,
        lastRefresh: null,
        articlesDisplayed: 0
      }
    };
    this.startTime = Date.now();
  }

  init(io) {
    this.io = io;
    this.stats.backend.status = 'running';
    
    // Update uptime every second
    setInterval(() => {
      this.stats.backend.uptime = Date.now() - this.startTime;
      this.broadcastStats();
    }, 1000);

    // Monitor WebSocket connections
    io.on('connection', (socket) => {
      this.stats.frontend.connectedClients++;
      console.log(`📊 Client connected. Total clients: ${this.stats.frontend.connectedClients}`);
      
      // Send current stats to new client
      socket.emit('monitoring-stats', this.stats);

      socket.on('disconnect', () => {
        this.stats.frontend.connectedClients--;
        console.log(`📊 Client disconnected. Total clients: ${this.stats.frontend.connectedClients}`);
      });

      socket.on('frontend-refresh', (data) => {
        this.stats.frontend.lastRefresh = new Date().toISOString();
        this.stats.frontend.articlesDisplayed = (data && data.articlesCount) || 0;
        this.broadcastStats();
      });
    });

    console.log('📊 Monitoring service initialized');
  }

  // News collection monitoring
  onNewsCollectionStart(totalSources) {
    this.stats.backend.newsCollection.lastRun = new Date().toISOString();
    this.stats.backend.newsCollection.totalSources = totalSources;
    this.stats.backend.newsCollection.activeSources = 0;
    this.stats.backend.newsCollection.articlesProcessed = 0;
    this.stats.backend.newsCollection.duplicatesFound = 0;
    this.stats.backend.newsCollection.errors = 0;
    this.stats.backend.lastActivity = new Date().toISOString();
    
    console.log('📊 News collection started');
    this.broadcastStats();
  }

  onSourceProcessed(sourceName, success) {
    if (success) {
      this.stats.backend.newsCollection.activeSources++;
    } else {
      this.stats.backend.newsCollection.errors++;
    }
    this.broadcastStats();
  }

  onArticleProcessed(result) {
    switch (result) {
      case 'added':
        this.stats.backend.newsCollection.articlesProcessed++;
        break;
      case 'duplicate':
        this.stats.backend.newsCollection.duplicatesFound++;
        break;
      case 'error':
        this.stats.backend.newsCollection.errors++;
        break;
    }
    this.stats.backend.lastActivity = new Date().toISOString();
    this.broadcastStats();
  }


  onNewsCollectionComplete(stats) {
    this.stats.backend.newsCollection.articlesProcessed += stats.processed || 0;
    this.stats.backend.newsCollection.duplicatesFound += stats.duplicates || 0;
    this.stats.backend.newsCollection.errors += stats.errors || 0;
    this.stats.backend.lastActivity = new Date().toISOString();
    
    console.log(`📊 News collection completed: ${stats.processed || 0} processed, ${stats.duplicates || 0} duplicates, ${stats.errors || 0} errors`);
    this.broadcastStats();
  }

  // Database monitoring
  onDatabaseActivity(action, data = {}) {
    this.stats.backend.database.status = 'active';
    this.stats.backend.database.lastInsert = new Date().toISOString();
    
    if (data.totalArticles !== undefined) {
      this.stats.backend.database.totalArticles = data.totalArticles;
    }
    
    this.stats.backend.lastActivity = new Date().toISOString();
    this.broadcastStats();
  }

  // API monitoring
  onApiRequest(endpoint, articlesCount = 0) {
    this.stats.backend.api.status = 'active';
    this.stats.backend.api.lastRequest = new Date().toISOString();
    this.stats.backend.api.requestCount++;
    
    if (endpoint === '/api/news' && articlesCount > 0) {
      this.stats.backend.database.totalArticles = Math.max(
        this.stats.backend.database.totalArticles, 
        articlesCount
      );
    }
    
    this.stats.backend.lastActivity = new Date().toISOString();
    this.broadcastStats();
  }

  // Health check
  getHealthStatus() {
    const now = Date.now();
    const lastActivity = this.stats.backend.lastActivity ? 
      new Date(this.stats.backend.lastActivity).getTime() : 0;
    
    // Backend is healthy if there was activity in the last 5 minutes
    const backendHealthy = (now - lastActivity) < 5 * 60 * 1000;
    
    return {
      backend: {
        status: backendHealthy ? 'healthy' : 'inactive',
        uptime: this.stats.backend.uptime,
        lastActivity: this.stats.backend.lastActivity
      },
      frontend: {
        status: this.stats.frontend.connectedClients > 0 ? 'connected' : 'disconnected',
        clients: this.stats.frontend.connectedClients
      },
      database: {
        status: this.stats.backend.database.totalArticles > 0 ? 'active' : 'empty',
        articles: this.stats.backend.database.totalArticles
      }
    };
  }

  broadcastStats() {
    if (this.io) {
      const healthStatus = this.getHealthStatus();
      this.io.emit('monitoring-stats', {
        ...this.stats,
        health: healthStatus,
        timestamp: new Date().toISOString()
      });
    }
  }

  // Format uptime for display
  formatUptime(ms) {
    const seconds = Math.floor(ms / 1000);
    const minutes = Math.floor(seconds / 60);
    const hours = Math.floor(minutes / 60);
    
    if (hours > 0) {
      return `${hours}h ${minutes % 60}m`;
    } else if (minutes > 0) {
      return `${minutes}m ${seconds % 60}s`;
    } else {
      return `${seconds}s`;
    }
  }
}

module.exports = new MonitoringService();