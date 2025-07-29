const os = require('os');
const fs = require('fs');
const EventEmitter = require('events');

class RealTimeMonitor extends EventEmitter {
  constructor() {
    super();
    this.isRunning = false;
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
        routes: new Map()
      },
      websocket: {
        connections: { total: 0, active: 0 },
        messages: { sent: 0, received: 0, errors: 0 },
        clients: new Map()
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
    this.activeRequests = new Map();
    this.activeQueries = new Map();
    this.performanceHistory = {
      cpu: [],
      memory: [],
      requests: [],
      responses: []
    };
    this.maxHistoryPoints = 100;
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
    
    // Curăță datele vechi la fiecare 30 secunde
    this.cleanupInterval = setInterval(() => {
      this.cleanup();
    }, 30000);
  }

  stop() {
    if (!this.isRunning) return;
    
    this.isRunning = false;
    clearInterval(this.systemInterval);
    clearInterval(this.appInterval);
    clearInterval(this.cleanupInterval);
    console.log('🔍 Real-time monitoring stopped');
  }

  collectSystemMetrics() {
    // CPU Usage
    const cpus = os.cpus();
    let totalIdle = 0;
    let totalTick = 0;
    
    cpus.forEach(cpu => {
      for (let type in cpu.times) {
        totalTick += cpu.times[type];
      }
      totalIdle += cpu.times.idle;
    });
    
    const idle = totalIdle / cpus.length;
    const total = totalTick / cpus.length;
    const usage = 100 - ~~(100 * idle / total);
    
    this.metrics.system.cpu.usage = usage;
    
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
    
    // Adaugă în istoric
    this.addToHistory('cpu', { timestamp: Date.now(), value: usage });
    this.addToHistory('memory', { 
      timestamp: Date.now(), 
      value: this.metrics.system.memory.percentage 
    });
    
    // Emit pentru actualizare live
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
    
    // Monitor response
    const originalSend = res.send;
    res.send = function(data) {
      const endTime = Date.now();
      const duration = endTime - startTime;
      
      // Update metrics
      this.metrics.http.requests.active--;
      
      if (res.statusCode >= 200 && res.statusCode < 400) {
        this.metrics.http.responses.success++;
      } else {
        this.metrics.http.responses.error++;
        this.metrics.http.requests.errors++;
      }
      
      // Update average response time
      this.updateAverageResponseTime(duration);
      
      // Update route statistics
      const route = `${req.method} ${req.route?.path || req.url}`;
      const routeStats = this.metrics.http.routes.get(route) || {
        requests: 0, errors: 0, avgTime: 0, totalTime: 0
      };
      
      routeStats.requests++;
      routeStats.totalTime += duration;
      routeStats.avgTime = routeStats.totalTime / routeStats.requests;
      
      if (res.statusCode >= 400) {
        routeStats.errors++;
      }
      
      this.metrics.http.routes.set(route, routeStats);
      
      // Log detailed response
      this.log('info', 'HTTP_REQUEST_END', {
        requestId,
        statusCode: res.statusCode,
        duration,
        responseSize: data?.length || 0,
        route
      });
      
      // Remove from active requests
      this.activeRequests.delete(requestId);
      
      // Add to history
      this.addToHistory('requests', {
        timestamp: endTime,
        duration,
        statusCode: res.statusCode,
        route
      });
      
      // Emit live update
      this.emit('httpMetrics', this.metrics.http);
      
      return originalSend.call(res, data);
    }.bind(this);
    
    return requestId;
  }

  updateAverageResponseTime(duration) {
    const total = this.metrics.http.requests.total;
    const current = this.metrics.http.requests.avgResponseTime;
    this.metrics.http.requests.avgResponseTime = 
      ((current * (total - 1)) + duration) / total;
  }

  // WebSocket Monitoring
  onWebSocketConnection(socket) {
    const clientId = socket.id;
    const connectionTime = Date.now();
    
    const clientData = {
      id: clientId,
      ip: socket.handshake.address,
      userAgent: socket.handshake.headers['user-agent'],
      connectedAt: connectionTime,
      messagesReceived: 0,
      messagesSent: 0,
      lastActivity: connectionTime
    };
    
    this.metrics.websocket.clients.set(clientId, clientData);
    this.metrics.websocket.connections.total++;
    this.metrics.websocket.connections.active++;
    
    this.log('info', 'WEBSOCKET_CONNECT', {
      clientId,
      ip: clientData.ip,
      userAgent: clientData.userAgent
    });
    
    // Monitor messages
    socket.onAny((event, ...args) => {
      this.onWebSocketMessage(clientId, 'received', event, args);
    });
    
    // Monitor disconnect
    socket.on('disconnect', (reason) => {
      this.onWebSocketDisconnect(clientId, reason);
    });
    
    this.emit('websocketMetrics', this.metrics.websocket);
  }

  onWebSocketMessage(clientId, direction, event, data) {
    const client = this.metrics.websocket.clients.get(clientId);
    if (!client) return;
    
    client.lastActivity = Date.now();
    
    if (direction === 'received') {
      client.messagesReceived++;
      this.metrics.websocket.messages.received++;
    } else {
      client.messagesSent++;
      this.metrics.websocket.messages.sent++;
    }
    
    this.log('debug', 'WEBSOCKET_MESSAGE', {
      clientId,
      direction,
      event,
      dataSize: JSON.stringify(data).length
    });
    
    this.emit('websocketMetrics', this.metrics.websocket);
  }

  onWebSocketDisconnect(clientId, reason) {
    const client = this.metrics.websocket.clients.get(clientId);
    if (!client) return;
    
    const sessionDuration = Date.now() - client.connectedAt;
    
    this.log('info', 'WEBSOCKET_DISCONNECT', {
      clientId,
      reason,
      sessionDuration,
      messagesReceived: client.messagesReceived,
      messagesSent: client.messagesSent
    });
    
    this.metrics.websocket.clients.delete(clientId);
    this.metrics.websocket.connections.active--;
    
    this.emit('websocketMetrics', this.metrics.websocket);
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
    // Remove old requests and queries that might be stuck
    const now = Date.now();
    const timeout = 30000; // 30 seconds
    
    for (const [id, request] of this.activeRequests) {
      if (now - request.startTime > timeout) {
        this.log('warn', 'HTTP_REQUEST_TIMEOUT', { requestId: id });
        this.activeRequests.delete(id);
        this.metrics.http.requests.active--;
      }
    }
    
    for (const [id, query] of this.activeQueries) {
      if (now - query.startTime > timeout) {
        this.log('warn', 'DATABASE_QUERY_TIMEOUT', { queryId: id });
        this.activeQueries.delete(id);
        this.metrics.database.queries.active--;
      }
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