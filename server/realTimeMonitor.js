const os = require('os');
const fs = require('fs');
const EventEmitter = require('events');

class RealTimeMonitor extends EventEmitter {
  constructor() {
    super();
    this.isRunning = false;
    this.previousCpuInfo = null;
    this.database = null;
    this.lastSavedTimestamp = 0;
    this.metrics = {
      system: {
        cpu: { usage: 0, cores: os.cpus().length },
        memory: { used: 0, total: os.totalmem(), free: 0, percentage: 0 },
        uptime: 0,
        loadAverage: []
      },
      app: {
        startTime: Date.now(),
        uptime: 0,
        version: '1.0.0',
        environment: process.env.NODE_ENV || 'development'
      },
      http: {
        requests: { total: 0, active: 0, errors: 0, avgResponseTime: 0 },
        responses: { success: 0, error: 0, pending: 0 },
        routes: {},
        errorDetails: []
      },
      websocket: {
        connections: { total: 0, active: 0, peak: 0, totalSessions: 0 },
        messages: { 
          sent: 0, received: 0, errors: 0, 
          avgSize: 0, totalSize: 0,
          events: new Map() // Track message events
        },
        clients: new Map(),
        performance: {
          avgConnectionTime: 0,
          avgMessageLatency: 0,
          disconnectReasons: new Map(),
          errorTypes: new Map()
        },
        history: {
          connections: [], // Last 2 hours
          messages: [],    // Last 2 hours  
          errors: [],      // Last 2 hours
          latency: []      // Last 2 hours
        }
      },
      database: {
        queries: { total: 0, active: 0, errors: 0, avgTime: 0 },
        connections: { active: 0, pool: 0 },
        operations: { read: 0, write: 0, delete: 0 }
      },
      scrapy: {
        status: 'idle',
        lastRun: null,
        articlesProcessed: 0,
        errors: 0,
        avgProcessingTime: 0
      },
      ai: {
        requests: { total: 0, active: 0, errors: 0 },
        tokens: { used: 0, cost: 0 },
        avgResponseTime: 0
      }
    };
    
    this.logs = [];
    this.maxLogs = 1000;
    this.maxErrorDetails = 50;
    this.activeRequests = new Map();
    this.activeQueries = new Map();
    this.performanceHistory = {
      cpu: [],
      memory: [],
      requests: [],
      responses: []
    };
    this.maxHistoryPoints = 7200; // 2 hours at 1 second intervals
    this.websocketHistoryMaxPoints = 1440; // 2 hours at 5 second intervals
  }

  setDatabase(database) {
    this.database = database;
  }

  start() {
    if (this.isRunning) return;
    
    this.isRunning = true;
    console.log('🔍 Real-time monitoring started');
    
    // Colectează metrici sistem la fiecare secundă
    this.systemInterval = setInterval(() => {
      this.collectSystemMetrics();
    }, 1000);
    
    // Colectează metrici aplicație la fiecare 500ms
    this.appInterval = setInterval(() => {
      this.collectAppMetrics();
    }, 500);
    
    // Curăță datele vechi la fiecare 5 secunde (agresiv pentru debugging)
    this.cleanupInterval = setInterval(() => {
      this.cleanup();
    }, 5000);
    
    // Curăță metricile vechi din baza de date o dată pe oră
    this.dbCleanupInterval = setInterval(() => {
      if (this.database) {
        this.database.cleanOldSystemMetrics()
          .then(deleted => {
            if (deleted > 0) {
              console.log(`🗑️ Cleaned ${deleted} old system metrics from database`);
            }
          })
          .catch(err => {
            console.error('❌ Failed to clean old system metrics:', err.message);
          });
      }
    }, 3600000); // 1 hour
  }

  stop() {
    if (!this.isRunning) return;
    
    this.isRunning = false;
    clearInterval(this.systemInterval);
    clearInterval(this.appInterval);
    clearInterval(this.cleanupInterval);
    clearInterval(this.dbCleanupInterval);
    console.log('🔍 Real-time monitoring stopped');
  }

  collectSystemMetrics() {
    // CPU Usage - Fixed calculation using time differences
    const cpus = os.cpus();
    let totalIdle = 0;
    let totalTick = 0;
    
    cpus.forEach(cpu => {
      for (let type in cpu.times) {
        totalTick += cpu.times[type];
      }
      totalIdle += cpu.times.idle;
    });
    
    const currentCpuInfo = {
      idle: totalIdle,
      total: totalTick,
      timestamp: Date.now()
    };
    
    let cpuUsage = 0;
    
    if (this.previousCpuInfo) {
      const idleDifference = currentCpuInfo.idle - this.previousCpuInfo.idle;
      const totalDifference = currentCpuInfo.total - this.previousCpuInfo.total;
      
      if (totalDifference > 0) {
        cpuUsage = Math.round(100 - (100 * idleDifference / totalDifference));
        // Ensure CPU usage is within reasonable bounds
        cpuUsage = Math.max(0, Math.min(100, cpuUsage));
      }
    }
    
    this.previousCpuInfo = currentCpuInfo;
    this.metrics.system.cpu.usage = cpuUsage;
    
    // Memory
    const freeMem = os.freemem();
    const totalMem = os.totalmem();
    const usedMem = totalMem - freeMem;
    
    this.metrics.system.memory = {
      used: usedMem,
      total: totalMem,
      free: freeMem,
      percentage: Math.round((usedMem / totalMem) * 100)
    };
    
    // System info
    this.metrics.system.uptime = os.uptime();
    this.metrics.system.loadAverage = os.loadavg();
    
    // Add to history
    this.addToHistory('cpu', { timestamp: Date.now(), value: this.metrics.system.cpu.usage });
    this.addToHistory('memory', { 
      timestamp: Date.now(), 
      value: this.metrics.system.memory.percentage 
    });
    
    // Save to database every 10 seconds to avoid too many writes
    const now = Date.now();
    if (this.database && (now - this.lastSavedTimestamp > 10000)) {
      this.database.saveSystemMetrics(this.metrics.system)
        .then(() => {
          console.log('💾 System metrics saved to database');
        })
        .catch(err => {
          console.error('❌ Failed to save system metrics:', err.message);
        });
      this.lastSavedTimestamp = now;
    }

    // Emit for live updates
    console.log('📊 System metrics collected:', { 
      cpu: this.metrics.system.cpu.usage, 
      memory: this.metrics.system.memory.percentage,
      timestamp: new Date().toISOString()
    });
    this.emit('systemMetrics', this.metrics.system);
  }

  collectAppMetrics() {
    // App uptime
    this.metrics.app.uptime = Date.now() - this.metrics.app.startTime;
    
    // Process metrics
    const processMetrics = process.memoryUsage();
    this.metrics.app.memory = {
      rss: processMetrics.rss,
      heapTotal: processMetrics.heapTotal,
      heapUsed: processMetrics.heapUsed,
      external: processMetrics.external
    };
    
    this.emit('appMetrics', this.metrics.app);
  }

  addToHistory(metric, data) {
    if (!this.performanceHistory[metric]) {
      this.performanceHistory[metric] = [];
    }
    
    this.performanceHistory[metric].push(data);
    
    if (this.performanceHistory[metric].length > this.maxHistoryPoints) {
      this.performanceHistory[metric].shift();
    }
  }

  // HTTP Request Monitoring
  startHttpRequest(req, res) {
    const requestId = `${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
    const startTime = Date.now();
    
    const requestData = {
      id: requestId,
      method: req.method,
      url: req.url,
      ip: req.ip || req.connection.remoteAddress,
      userAgent: req.get('User-Agent'),
      startTime,
      headers: req.headers,
      body: req.method === 'POST' ? req.body : null
    };
    
    this.activeRequests.set(requestId, requestData);
    this.metrics.http.requests.total++;
    this.metrics.http.requests.active++;
    
    // Log detailed request
    this.log('info', 'HTTP_REQUEST_START', {
      requestId,
      method: req.method,
      url: req.url,
      ip: requestData.ip,
      userAgent: requestData.userAgent
    });
    
    // Set timer to warn about slow requests
    const SLOW_REQUEST_THRESHOLD = 5000; // 5 seconds
    const slowRequestTimer = setTimeout(() => {
      if (this.activeRequests.has(requestId)) {
        this.log('warn', 'SLOW_REQUEST_DETECTED', {
          requestId,
          method: req.method,
          url: req.url,
          duration: Date.now() - startTime,
          threshold: SLOW_REQUEST_THRESHOLD
        });
        
        // Emit warning to frontend
        this.emit('slowRequest', {
          requestId,
          method: req.method,
          url: req.url,
          duration: Date.now() - startTime,
          ip: requestData.ip
        });
      }
    }, SLOW_REQUEST_THRESHOLD);
    
    // Store timer reference for cleanup
    requestData.slowRequestTimer = slowRequestTimer;
    
    // Monitor response
    const originalSend = res.send;
    const monitor = this; // Capture the monitor instance
    res.send = function(data) {
      const endTime = Date.now();
      const duration = endTime - startTime;
      
      // Update metrics
      monitor.metrics.http.requests.active--;
      
      if (res.statusCode >= 200 && res.statusCode < 400) {
        monitor.metrics.http.responses.success++;
      } else {
        monitor.metrics.http.responses.error++;
        monitor.metrics.http.requests.errors++;
      }
      
      // Update average response time
      monitor.updateAverageResponseTime(duration);
      
      // Update route statistics
      const route = `${req.method} ${req.url}`;
      if (!monitor.metrics.http.routes[route]) {
        monitor.metrics.http.routes[route] = {
          requests: 0, errors: 0, avgTime: 0, totalTime: 0
        };
      }
      
      const routeStats = monitor.metrics.http.routes[route];
      routeStats.requests++;
      routeStats.totalTime += duration;
      routeStats.avgTime = routeStats.totalTime / routeStats.requests;
      
      if (res.statusCode >= 400) {
        routeStats.errors++;
        
        // Store error details
        const errorDetail = {
          id: requestId,
          timestamp: Date.now(),
          method: req.method,
          url: req.url,
          statusCode: res.statusCode,
          duration,
          ip: requestData?.ip || req.ip,
          userAgent: requestData?.userAgent || req.get('User-Agent'),
          errorMessage: data ? data.toString().substring(0, 500) : 'No error message',
          headers: req.headers
        };
        
        monitor.metrics.http.errorDetails.unshift(errorDetail);
        
        // Keep only the last maxErrorDetails errors
        if (monitor.metrics.http.errorDetails.length > monitor.maxErrorDetails) {
          monitor.metrics.http.errorDetails = monitor.metrics.http.errorDetails.slice(0, monitor.maxErrorDetails);
        }
      }
      
      // Log detailed response
      monitor.log('info', 'HTTP_REQUEST_END', {
        requestId,
        statusCode: res.statusCode,
        duration,
        responseSize: data?.length || 0,
        route
      });
      
      // Clear slow request timer and remove from active requests
      const requestData = monitor.activeRequests.get(requestId);
      if (requestData?.slowRequestTimer) {
        clearTimeout(requestData.slowRequestTimer);
      }
      monitor.activeRequests.delete(requestId);
      
      // Add to history
      monitor.addToHistory('requests', {
        timestamp: endTime,
        duration,
        statusCode: res.statusCode,
        route
      });
      
      // Emit live update
      monitor.emit('httpMetrics', monitor.metrics.http);
      
      return originalSend.call(res, data);
    };
    
    return requestId;
  }

  updateAverageResponseTime(duration) {
    const total = this.metrics.http.requests.total;
    const current = this.metrics.http.requests.avgResponseTime;
    this.metrics.http.requests.avgResponseTime = 
      ((current * (total - 1)) + duration) / total;
  }

  // Enhanced WebSocket Monitoring
  onWebSocketConnection(socket) {
    const clientId = socket.id;
    const connectionTime = Date.now();
    
    const clientData = {
      id: clientId,
      ip: socket.handshake.address,
      userAgent: socket.handshake.headers['user-agent'] || 'Unknown',
      connectedAt: connectionTime,
      messagesReceived: 0,
      messagesSent: 0,
      lastActivity: connectionTime,
      totalDataReceived: 0,
      totalDataSent: 0,
      events: new Map(), // Track event types
      latencyHistory: [],
      errors: 0
    };
    
    this.metrics.websocket.clients.set(clientId, clientData);
    this.metrics.websocket.connections.total++;
    this.metrics.websocket.connections.active++;
    this.metrics.websocket.connections.totalSessions++;
    
    // Update peak connections
    if (this.metrics.websocket.connections.active > this.metrics.websocket.connections.peak) {
      this.metrics.websocket.connections.peak = this.metrics.websocket.connections.active;
    }
    
    // Add to history
    this.addWebSocketHistory('connections', {
      timestamp: connectionTime,
      type: 'connect',
      clientId,
      active: this.metrics.websocket.connections.active,
      ip: clientData.ip,
      userAgent: clientData.userAgent
    });
    
    this.log('info', 'WEBSOCKET_CONNECT', {
      clientId,
      ip: clientData.ip,
      userAgent: clientData.userAgent,
      totalClients: this.metrics.websocket.connections.active
    });
    
    // Enhanced message monitoring
    socket.onAny((event, ...args) => {
      this.onWebSocketMessage(clientId, 'received', event, args, Date.now());
    });
    
    // Monitor outgoing messages
    const originalEmit = socket.emit;
    socket.emit = (...args) => {
      const [event, ...data] = args;
      this.onWebSocketMessage(clientId, 'sent', event, data, Date.now());
      return originalEmit.apply(socket, args);
    };
    
    // Enhanced disconnect monitoring
    socket.on('disconnect', (reason) => {
      this.onWebSocketDisconnect(clientId, reason);
    });
    
    // Monitor errors
    socket.on('error', (error) => {
      this.onWebSocketError(clientId, error);
    });
    
    this.emit('websocketMetrics', this.metrics.websocket);
  }

  onWebSocketMessage(clientId, direction, event, data, timestamp = Date.now()) {
    const client = this.metrics.websocket.clients.get(clientId);
    if (!client) return;
    
    const messageSize = JSON.stringify(data).length;
    client.lastActivity = timestamp;
    
    // Update client metrics
    if (direction === 'received') {
      client.messagesReceived++;
      client.totalDataReceived += messageSize;
      this.metrics.websocket.messages.received++;
    } else {
      client.messagesSent++;
      client.totalDataSent += messageSize;
      this.metrics.websocket.messages.sent++;
    }
    
    // Track event types
    const eventCount = client.events.get(event) || 0;
    client.events.set(event, eventCount + 1);
    
    const globalEventCount = this.metrics.websocket.messages.events.get(event) || 0;
    this.metrics.websocket.messages.events.set(event, globalEventCount + 1);
    
    // Update total message size and average
    this.metrics.websocket.messages.totalSize += messageSize;
    const totalMessages = this.metrics.websocket.messages.sent + this.metrics.websocket.messages.received;
    this.metrics.websocket.messages.avgSize = totalMessages > 0 ? 
      Math.round(this.metrics.websocket.messages.totalSize / totalMessages) : 0;
    
    // Add to message history
    this.addWebSocketHistory('messages', {
      timestamp,
      clientId,
      direction,
      event,
      size: messageSize,
      totalActive: this.metrics.websocket.connections.active
    });
    
    this.log('debug', 'WEBSOCKET_MESSAGE', {
      clientId,
      direction,
      event,
      dataSize: messageSize
    });
    
    this.emit('websocketMetrics', this.metrics.websocket);
  }

  onWebSocketDisconnect(clientId, reason) {
    const client = this.metrics.websocket.clients.get(clientId);
    if (!client) return;
    
    const disconnectTime = Date.now();
    const sessionDuration = disconnectTime - client.connectedAt;
    
    // Update disconnect reasons tracking
    const reasonCount = this.metrics.websocket.performance.disconnectReasons.get(reason) || 0;
    this.metrics.websocket.performance.disconnectReasons.set(reason, reasonCount + 1);
    
    // Update average connection time
    const totalSessions = this.metrics.websocket.connections.totalSessions;
    const currentAvg = this.metrics.websocket.performance.avgConnectionTime;
    this.metrics.websocket.performance.avgConnectionTime = 
      ((currentAvg * (totalSessions - 1)) + sessionDuration) / totalSessions;
    
    // Add to history
    this.addWebSocketHistory('connections', {
      timestamp: disconnectTime,
      type: 'disconnect',
      clientId,
      reason,
      sessionDuration,
      messagesReceived: client.messagesReceived,
      messagesSent: client.messagesSent,
      totalDataReceived: client.totalDataReceived,
      totalDataSent: client.totalDataSent,
      active: this.metrics.websocket.connections.active - 1,
      ip: client.ip
    });
    
    this.log('info', 'WEBSOCKET_DISCONNECT', {
      clientId,
      reason,
      sessionDuration,
      messagesReceived: client.messagesReceived,
      messagesSent: client.messagesSent,
      dataReceived: client.totalDataReceived,
      dataSent: client.totalDataSent
    });
    
    this.metrics.websocket.clients.delete(clientId);
    this.metrics.websocket.connections.active--;
    
    this.emit('websocketMetrics', this.metrics.websocket);
  }
  
  onWebSocketError(clientId, error) {
    const client = this.metrics.websocket.clients.get(clientId);
    if (client) {
      client.errors++;
    }
    
    this.metrics.websocket.messages.errors++;
    
    // Track error types
    const errorType = error.type || error.name || 'Unknown';
    const errorCount = this.metrics.websocket.performance.errorTypes.get(errorType) || 0;
    this.metrics.websocket.performance.errorTypes.set(errorType, errorCount + 1);
    
    // Add to error history
    this.addWebSocketHistory('errors', {
      timestamp: Date.now(),
      clientId,
      errorType,
      message: error.message || 'Unknown error',
      stack: error.stack
    });
    
    this.log('error', 'WEBSOCKET_ERROR', {
      clientId,
      errorType,
      message: error.message,
      stack: error.stack
    });
    
    this.emit('websocketMetrics', this.metrics.websocket);
  }
  
  // Add WebSocket history data
  addWebSocketHistory(type, data) {
    const history = this.metrics.websocket.history[type];
    if (!history) return;
    
    history.push(data);
    
    // Keep only last 2 hours of data (depending on data frequency)
    const maxPoints = type === 'messages' ? this.websocketHistoryMaxPoints * 10 : this.websocketHistoryMaxPoints;
    if (history.length > maxPoints) {
      history.shift();
    }
  }

  // Database Monitoring
  startDatabaseQuery(query, params) {
    const queryId = `${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
    const startTime = Date.now();
    
    const queryData = {
      id: queryId,
      query: query.substring(0, 200),
      params,
      startTime,
      type: this.getQueryType(query)
    };
    
    this.activeQueries.set(queryId, queryData);
    this.metrics.database.queries.total++;
    this.metrics.database.queries.active++;
    
    // Update operation counters
    switch (queryData.type) {
      case 'SELECT':
        this.metrics.database.operations.read++;
        break;
      case 'INSERT':
      case 'UPDATE':
        this.metrics.database.operations.write++;
        break;
      case 'DELETE':
        this.metrics.database.operations.delete++;
        break;
    }
    
    this.log('debug', 'DATABASE_QUERY_START', {
      queryId,
      type: queryData.type,
      query: queryData.query
    });
    
    return queryId;
  }

  endDatabaseQuery(queryId, error = null) {
    const queryData = this.activeQueries.get(queryId);
    if (!queryData) return;
    
    const endTime = Date.now();
    const duration = endTime - queryData.startTime;
    
    this.metrics.database.queries.active--;
    
    if (error) {
      this.metrics.database.queries.errors++;
      this.log('error', 'DATABASE_QUERY_ERROR', {
        queryId,
        duration,
        error: error.message,
        query: queryData.query
      });
    } else {
      this.log('debug', 'DATABASE_QUERY_END', {
        queryId,
        duration,
        type: queryData.type
      });
    }
    
    // Update average query time
    const total = this.metrics.database.queries.total;
    const current = this.metrics.database.queries.avgTime;
    this.metrics.database.queries.avgTime = 
      ((current * (total - 1)) + duration) / total;
    
    this.activeQueries.delete(queryId);
    this.emit('databaseMetrics', this.metrics.database);
  }

  getQueryType(query) {
    const upperQuery = query.trim().toUpperCase();
    if (upperQuery.startsWith('SELECT')) return 'SELECT';
    if (upperQuery.startsWith('INSERT')) return 'INSERT';
    if (upperQuery.startsWith('UPDATE')) return 'UPDATE';
    if (upperQuery.startsWith('DELETE')) return 'DELETE';
    return 'OTHER';
  }

  // Scrapy Monitoring
  onScrapyStart() {
    this.metrics.scrapy.status = 'running';
    this.metrics.scrapy.lastRun = Date.now();
    
    this.log('info', 'SCRAPY_START', {
      timestamp: this.metrics.scrapy.lastRun
    });
    
    this.emit('scrapyMetrics', this.metrics.scrapy);
  }

  onScrapyEnd(articlesProcessed, errors = 0) {
    this.metrics.scrapy.status = 'idle';
    this.metrics.scrapy.articlesProcessed += articlesProcessed;
    this.metrics.scrapy.errors += errors;
    
    const duration = Date.now() - this.metrics.scrapy.lastRun;
    this.metrics.scrapy.avgProcessingTime = duration;
    
    this.log('info', 'SCRAPY_END', {
      duration,
      articlesProcessed,
      errors
    });
    
    this.emit('scrapyMetrics', this.metrics.scrapy);
  }

  // AI Service Monitoring
  startAIRequest(prompt, model = 'gpt-4o-mini') {
    const requestId = `ai_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
    const startTime = Date.now();
    
    this.metrics.ai.requests.total++;
    this.metrics.ai.requests.active++;
    
    this.log('info', 'AI_REQUEST_START', {
      requestId,
      model,
      promptLength: prompt.length
    });
    
    return { requestId, startTime };
  }

  endAIRequest(requestId, startTime, tokens = 0, error = null) {
    const duration = Date.now() - startTime;
    
    this.metrics.ai.requests.active--;
    
    if (error) {
      this.metrics.ai.requests.errors++;
      this.log('error', 'AI_REQUEST_ERROR', {
        requestId,
        duration,
        error: error.message
      });
    } else {
      this.metrics.ai.tokens.used += tokens;
      this.metrics.ai.tokens.cost += this.calculateTokenCost(tokens);
      
      // Update average response time
      const total = this.metrics.ai.requests.total;
      const current = this.metrics.ai.avgResponseTime;
      this.metrics.ai.avgResponseTime = 
        ((current * (total - 1)) + duration) / total;
      
      this.log('info', 'AI_REQUEST_END', {
        requestId,
        duration,
        tokens
      });
    }
    
    this.emit('aiMetrics', this.metrics.ai);
  }

  calculateTokenCost(tokens) {
    // GPT-4o-mini pricing: ~$0.0001 per 1K tokens
    return (tokens / 1000) * 0.0001;
  }

  // Logging System
  log(level, event, data) {
    const logEntry = {
      timestamp: Date.now(),
      level: level.toUpperCase(),
      event,
      data,
      id: `${Date.now()}_${Math.random().toString(36).substr(2, 9)}`
    };
    
    this.logs.unshift(logEntry);
    
    if (this.logs.length > this.maxLogs) {
      this.logs.pop();
    }
    
    // Console output with colors
    const colors = {
      ERROR: '\x1b[31m',
      WARN: '\x1b[33m',
      INFO: '\x1b[32m',
      DEBUG: '\x1b[36m',
      RESET: '\x1b[0m'
    };
    
    const color = colors[level.toUpperCase()] || colors.RESET;
    console.log(`${color}[${level.toUpperCase()}] ${event}${colors.RESET}`, data);
    
    // Emit for live updates
    this.emit('log', logEntry);
  }

  // Cleanup
  cleanup() {
    // AGGRESSIVE cleanup - remove old requests and queries that might be stuck
    const now = Date.now();
    const REQUEST_TIMEOUT = 15000; // 15 seconds for regular requests
    const QUERY_TIMEOUT = 10000; // 10 seconds for database queries
    
    let cleanedRequests = 0;
    let cleanedQueries = 0;
    
    // Clean stuck HTTP requests
    for (const [id, request] of this.activeRequests) {
      const duration = now - request.startTime;
      if (duration > REQUEST_TIMEOUT) {
        this.log('warn', 'FORCE_CLEANUP_HTTP_REQUEST', { 
          requestId: id, 
          url: request.url,
          method: request.method,
          duration,
          ip: request.ip
        });
        
        // Clear timer if exists
        if (request.slowRequestTimer) {
          clearTimeout(request.slowRequestTimer);
        }
        
        this.activeRequests.delete(id);
        this.metrics.http.requests.active = Math.max(0, this.metrics.http.requests.active - 1);
        cleanedRequests++;
      }
    }
    
    // Clean stuck database queries
    for (const [id, query] of this.activeQueries) {
      if (now - query.startTime > QUERY_TIMEOUT) {
        this.log('warn', 'FORCE_CLEANUP_DATABASE_QUERY', { 
          queryId: id,
          query: query.query,
          duration: now - query.startTime
        });
        this.activeQueries.delete(id);
        this.metrics.database.queries.active = Math.max(0, this.metrics.database.queries.active - 1);
        cleanedQueries++;
      }
    }
    
    // Log cleanup results if any
    if (cleanedRequests > 0 || cleanedQueries > 0) {
      console.warn(`🧹 CLEANUP: Removed ${cleanedRequests} stuck requests and ${cleanedQueries} stuck queries`);
      
      // Emit cleanup event for monitoring
      this.emit('cleanup', {
        requests: cleanedRequests,
        queries: cleanedQueries,
        timestamp: now
      });
    }
  }

  // Get all metrics
  getAllMetrics() {
    return {
      ...this.metrics,
      performanceHistory: this.performanceHistory,
      activeRequests: Array.from(this.activeRequests.values()),
      activeQueries: Array.from(this.activeQueries.values()),
      recentLogs: this.logs.slice(0, 50)
    };
  }

  // Get specific metrics
  getMetrics(category) {
    return this.metrics[category] || null;
  }
  
  // Get all metrics without circular references
  getAllMetrics() {
    // Clean active requests by removing circular references (timers)
    const cleanActiveRequests = Array.from(this.activeRequests.values()).map(req => ({
      id: req.id,
      method: req.method,
      url: req.url,
      ip: req.ip,
      userAgent: req.userAgent,
      startTime: req.startTime,
      headers: req.headers,
      body: req.body
      // Exclude slowRequestTimer to prevent circular reference
    }));
    
    // Convert websocket metrics with Maps to serializable format
    const websocketMetrics = {
      ...this.metrics.websocket,
      clients: Array.from(this.metrics.websocket.clients.entries()).map(([id, client]) => [id, {
        ...client,
        events: Array.from(client.events.entries())
      }]),
      messages: {
        ...this.metrics.websocket.messages,
        events: Array.from(this.metrics.websocket.messages.events.entries())
      },
      performance: {
        ...this.metrics.websocket.performance,
        disconnectReasons: Array.from(this.metrics.websocket.performance.disconnectReasons.entries()),
        errorTypes: Array.from(this.metrics.websocket.performance.errorTypes.entries())
      }
    };

    return {
      system: this.metrics.system,
      app: this.metrics.app,
      http: this.metrics.http,
      websocket: websocketMetrics,
      database: this.metrics.database,
      scrapy: this.metrics.scrapy,
      ai: this.metrics.ai,
      performanceHistory: {
        cpu: this.performanceHistory.cpu,
        memory: this.performanceHistory.memory,
        requests: this.performanceHistory.requests,
        responses: []
      },
      activeRequests: cleanActiveRequests,
      activeQueries: Array.from(this.activeQueries.values()),
      recentLogs: (this.recentLogs || []).slice(-50)
    };
  }

  // Get logs with filtering
  getLogs(level = null, limit = 100, event = null) {
    let filteredLogs = this.logs;
    
    if (level) {
      filteredLogs = filteredLogs.filter(log => log.level === level.toUpperCase());
    }
    
    if (event) {
      filteredLogs = filteredLogs.filter(log => log.event.includes(event));
    }
    
    return filteredLogs.slice(0, limit);
  }

  // Record AI request for dashboard metrics
  recordAIRequest(provider, processingTime, tokens = 0, error = null) {
    this.metrics.ai.requests.total++;
    
    if (error) {
      this.metrics.ai.requests.errors++;
    } else {
      this.metrics.ai.tokens.used += tokens;
      this.metrics.ai.tokens.cost += this.calculateTokenCost(tokens);
      
      // Update average response time
      const total = this.metrics.ai.requests.total;
      const current = this.metrics.ai.avgResponseTime;
      this.metrics.ai.avgResponseTime = 
        ((current * (total - 1)) + processingTime) / total;
    }
    
    this.log('info', 'AI_DASHBOARD_REQUEST', {
      provider,
      processingTime,
      tokens,
      error: error?.message
    });
    
    this.emit('aiMetrics', this.metrics.ai);
  }
}

module.exports = new RealTimeMonitor();