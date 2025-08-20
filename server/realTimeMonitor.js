const os = require('os');
const fs = require('fs');
const { exec } = require('child_process');
const Database = require('./database');
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
        loadAverage: [],
        gpu: { available: false, usage: 0, memory: { used: 0, total: 0, percentage: 0 } }
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
      scraping: {
        status: 'idle',
        library: 'scrapy',
        lastRun: null,
        lastRunArticles: 0,
        lastRunErrors: 0,
        lastProcessingTime: 0,
        totalArticles: 0,
        errorsTotal: 0,
        avgProcessingTime: 0,
        runCount: 0
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
      gpu: [],
      gpuMemory: [],
      requests: [],
      responses: []
    };
    // Keep last 2 hours at 1 sample/sec
    this.maxHistoryPoints = 2 * 60 * 60; // 7200
    this._lastGpuSampleAt = 0;
    this._lastPersistTs = 0;
    this.db = null;
    this._lastWsPersistTs = 0;

    // Keep previous CPU times for delta-based usage calculation
    this.prevCpuTimes = os.cpus().map(cpu => ({ ...cpu.times }));
  }

  start() {
    if (this.isRunning) return;
    
    this.isRunning = true;
    console.log('🔍 Real-time monitoring started');
    // Lazy-init DB for metrics persistence
    try { this.db = new Database(); } catch (e) { console.warn('DB init for monitor failed:', e.message); }
    
    // Colectează metrici sistem la ~10Hz pentru grafic fluent, emis tot la 1Hz
    let lastEmit = 0;
    this.systemInterval = setInterval(() => {
      const beforeEmit = Date.now();
      this.collectSystemMetrics();
      if (beforeEmit - lastEmit >= 1000) {
        lastEmit = beforeEmit;
        // Emit snapshot explicit în cazul în care sampleGpu este întârziat
        this.emit('systemMetrics', this.metrics.system);
      }
    }, 100);
    
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
    // CPU Usage (delta across samples for real-time accuracy)
    const cpus = os.cpus();
    let idleDeltaSum = 0;
    let totalDeltaSum = 0;

    for (let i = 0; i < cpus.length; i++) {
      const timesNow = cpus[i].times;
      const timesPrev = this.prevCpuTimes[i] || timesNow;

      const totalNow = Object.values(timesNow).reduce((a, b) => a + b, 0);
      const totalPrev = Object.values(timesPrev).reduce((a, b) => a + b, 0);

      const totalDelta = totalNow - totalPrev;
      const idleDelta = timesNow.idle - timesPrev.idle;

      if (totalDelta > 0) {
        totalDeltaSum += totalDelta;
        idleDeltaSum += idleDelta;
      }

      // Update previous snapshot
      this.prevCpuTimes[i] = { ...timesNow };
    }

    const usage = totalDeltaSum > 0
      ? Math.round(100 * (1 - idleDeltaSum / totalDeltaSum))
      : this.metrics.system.cpu.usage;

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
    const nowTs = Date.now();
    this.addToHistory('cpu', { timestamp: nowTs, value: usage });
    this.addToHistory('memory', { 
      timestamp: nowTs, 
      value: this.metrics.system.memory.percentage 
    });
    
    // GPU metrics (sample every 2s to reduce overhead)
    const now = nowTs;
    if (now - this._lastGpuSampleAt >= 2000) {
      this._lastGpuSampleAt = now;
      this.sampleGpuMetrics().then((gpu) => {
        if (gpu) {
          this.metrics.system.gpu = gpu;
          this.addToHistory('gpu', { timestamp: now, value: gpu.usage || 0 });
          const gpuMemPct = gpu.memory && gpu.memory.total > 0 ? Math.round((gpu.memory.used / gpu.memory.total) * 100) : 0;
          this.addToHistory('gpuMemory', { timestamp: now, value: gpuMemPct });
        }
        // Persist once per second
        this.persistSystemMetric(now);
        // Emit pentru actualizare live
        this.emit('systemMetrics', this.metrics.system);
      }).catch(() => {
        this.persistSystemMetric(now);
        // Emit fără GPU dacă sampling-ul a eșuat
        this.emit('systemMetrics', this.metrics.system);
      });
    } else {
      this.persistSystemMetric(now);
      // Emit fără a re-sample GPU
      this.emit('systemMetrics', this.metrics.system);
    }
  }

  persistSystemMetric(nowTs) {
    if (!this.db) return;
    if (nowTs - this._lastPersistTs < 1000) return; // ~1Hz
    this._lastPersistTs = nowTs;
    try {
      const cpu = this.metrics.system.cpu.usage || 0;
      const mem = this.metrics.system.memory?.percentage || 0;
      const gpu = this.metrics.system.gpu?.usage || 0;
      const gpuMem = this.metrics.system.gpu?.memory?.percentage || 0;
      this.db.insertSystemMetric({ ts: nowTs, cpu_pct: cpu, mem_pct: mem, gpu_pct: gpu, gpu_mem_pct: gpuMem }).catch(()=>{});
      // Prune older than 3 hours to keep DB small
      const threeHoursAgo = nowTs - 3 * 60 * 60 * 1000;
      this.db.pruneOldSystemMetrics(threeHoursAgo).catch(()=>{});
    } catch {}
  }

  async sampleGpuMetrics() {
    return new Promise((resolve) => {
      // Try nvidia-smi
      exec('nvidia-smi --query-gpu=utilization.gpu,memory.used,memory.total --format=csv,noheader,nounits', { timeout: 1000 }, (err, stdout) => {
        if (!err && stdout) {
          try {
            const [utilStr, memUsedStr, memTotalStr] = stdout.trim().split(',').map(s => s.trim());
            const usage = parseInt(utilStr) || 0;
            const memUsed = parseInt(memUsedStr) * 1024 * 1024 || 0; // MB->B if nounits returns MB; adjust if needed
            const memTotal = parseInt(memTotalStr) * 1024 * 1024 || 0;
            return resolve({ available: true, usage, memory: { used: memUsed, total: memTotal, percentage: memTotal ? Math.round((memUsed / memTotal) * 100) : 0 } });
          } catch {}
        }
        // Try rocm-smi (AMD) minimal utilization, skipped if not present
        exec('rocm-smi --showuse --csv', { timeout: 1000 }, (err2, stdout2) => {
          if (!err2 && stdout2 && stdout2.toLowerCase().includes('gpu use')) {
            try {
              const lines = stdout2.trim().split('\n');
              const header = lines[0].split(',').map(s=>s.trim().toLowerCase());
              const idx = header.indexOf('gpu use (%)');
              if (idx >= 0) {
                const first = lines[1].split(',');
                const usage = parseInt(first[idx]) || 0;
                return resolve({ available: true, usage, memory: { used: 0, total: 0, percentage: 0 } });
              }
            } catch {}
          }
          // Fallback: no GPU
          return resolve({ available: false, usage: 0, memory: { used: 0, total: 0, percentage: 0 } });
        });
      });
    });
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
  // Generic scraping run markers (any library)
  onScrapingStart(library = 'scrapy') {
    this.metrics.scraping.status = 'running';
    this.metrics.scraping.library = library;
    this.metrics.scraping.lastRun = Date.now();
    this.metrics.scraping.lastRunArticles = 0;
    this.metrics.scraping.lastRunErrors = 0;
    this.metrics.scraping.lastProcessingTime = 0;
    this.emit('scrapyMetrics', { // keep event name for client compatibility
      ...this.metrics.scraping
    });
  }

  onScrapingEnd(articlesProcessed = 0, errors = 0, library = 'scrapy') {
    this.metrics.scraping.status = 'idle';
    this.metrics.scraping.library = library;
    const duration = Math.max(0, Date.now() - (this.metrics.scraping.lastRun || Date.now()));
    this.metrics.scraping.lastRunArticles = articlesProcessed;
    this.metrics.scraping.lastRunErrors = errors;
    this.metrics.scraping.lastProcessingTime = duration;
    this.metrics.scraping.totalArticles += articlesProcessed;
    this.metrics.scraping.errorsTotal += errors;
    this.metrics.scraping.runCount += 1;
    const n = this.metrics.scraping.runCount;
    const currentAvg = this.metrics.scraping.avgProcessingTime || 0;
    this.metrics.scraping.avgProcessingTime = ((currentAvg * (n - 1)) + duration) / n;
    // Persist history
    try { if (this.db) this.db.insertScrapyMetric({ ts: Date.now(), last_articles: articlesProcessed, status: 'idle', last_errors: errors }); } catch {}
    this.emit('scrapyMetrics', { ...this.metrics.scraping });
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
    const requestId = `${Date.now()}_${Math.random().toString(36).slice(2, 11)}`;
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
    
    // Monitor response via finish/close to cover all send methods
    let completed = false;
    const finalize = (endType = 'finish') => {
      if (completed) return;
      completed = true;
      const endTime = Date.now();
      const duration = endTime - startTime;

      // Update metrics
      this.metrics.http.requests.active = Math.max(0, this.metrics.http.requests.active - 1);

      if (res.statusCode >= 200 && res.statusCode < 400) {
        this.metrics.http.responses.success++;
      } else {
        this.metrics.http.responses.error++;
        this.metrics.http.requests.errors++;
      }

      // Update average response time
      this.updateAverageResponseTime(duration);

      // Update route statistics
      const route = `${req.method} ${req.route?.path || req.baseUrl || req.originalUrl || req.url}`;
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
      const contentLengthHeader = res.getHeader && res.getHeader('content-length');
      const responseSize = typeof contentLengthHeader === 'string' ? parseInt(contentLengthHeader) : (contentLengthHeader || 0);
      this.log('info', 'HTTP_REQUEST_END', {
        requestId,
        statusCode: res.statusCode,
        duration,
        responseSize: Number.isFinite(responseSize) ? responseSize : 0,
        route,
        endType
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

      // Emit live update (serialize routes Map for transport)
      const httpSnapshot = {
        ...this.metrics.http,
        routes: Object.fromEntries(this.metrics.http.routes)
      };
      this.emit('httpMetrics', httpSnapshot);
      // Persist snapshot throttled
      try { this.persistHttpMetric(); } catch {}
    };

    res.on('finish', finalize);
    res.on('close', () => finalize('close'));
    
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
    // persist ~1Hz
    this.persistWebsocketMetric();
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
    this.persistWebsocketMetric();
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
    // Persist DB metrics ~1Hz
    this.persistDbMetric();
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
    this.metrics.scrapy.lastRunArticles = 0;
    this.metrics.scrapy.lastRunErrors = 0;
    this.metrics.scrapy.lastProcessingTime = 0;
    
    this.log('info', 'SCRAPY_START', {
      timestamp: this.metrics.scrapy.lastRun
    });
    
    this.emit('scrapyMetrics', this.metrics.scrapy);
  }

  onScrapyEnd(articlesProcessed, errors = 0) {
    this.metrics.scrapy.status = 'idle';
    const duration = Math.max(0, Date.now() - (this.metrics.scrapy.lastRun || Date.now()));
    // Per-run
    this.metrics.scrapy.lastRunArticles = articlesProcessed;
    this.metrics.scrapy.lastRunErrors = errors;
    this.metrics.scrapy.lastProcessingTime = duration;
    // Aggregates
    this.metrics.scrapy.totalArticles += articlesProcessed;
    this.metrics.scrapy.errorsTotal += errors;
    this.metrics.scrapy.runCount += 1;
    const n = this.metrics.scrapy.runCount;
    const currentAvg = this.metrics.scrapy.avgProcessingTime || 0;
    this.metrics.scrapy.avgProcessingTime = ((currentAvg * (n - 1)) + duration) / n;

    this.log('info', 'SCRAPY_END', { duration, articlesProcessed, errors });
    this.emit('scrapyMetrics', this.metrics.scrapy);
    // Persist snapshot of last run
    try {
      if (this.db) {
        this.db.insertScrapyMetric({
          ts: Date.now(),
          last_articles: this.metrics.scrapy.lastRunArticles || 0,
          status: this.metrics.scrapy.status || 'idle',
          last_errors: this.metrics.scrapy.lastRunErrors || 0
        }).catch(()=>{});
        const cutoff = Date.now() - 3 * 60 * 60 * 1000;
        this.db.pruneOldScrapyMetrics(cutoff).catch(()=>{});
      }
    } catch {}
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
    this.persistAiMetric();
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
    if (event === 'WEBSOCKET_CONNECT' || event === 'WEBSOCKET_DISCONNECT' || event === 'WEBSOCKET_MESSAGE') {
      this.persistWebsocketMetric();
    }
  }

  // Cleanup
  cleanup() {
    // Remove old requests and queries that might be stuck
    const now = Date.now();
    const timeout = parseInt(process.env.MONITOR_HTTP_TIMEOUT_MS || '20000'); // configurable, default 20s
    const debugTimeout = parseInt(process.env.MONITOR_HTTP_TIMEOUT_DEBUG_MS || '60000');
    const isDebugLongRunning = (url = '') => {
      return url.startsWith('/api/ollama/test') || url.startsWith('/api/ai-chat-stream');
    };
    
    for (const [id, request] of this.activeRequests) {
      const perRequestTimeout = isDebugLongRunning(request.url) ? debugTimeout : timeout;
      const shouldCountAsError = !isDebugLongRunning(request.url);
      if (now - request.startTime > perRequestTimeout) {
        // Log with useful context
        const ageMs = now - request.startTime;
        this.log('warn', 'HTTP_REQUEST_TIMEOUT', {
          requestId: id,
          method: request.method,
          url: request.url,
          ageMs
        });

        // Update metrics to reflect timeout as an error
        this.metrics.http.requests.active = Math.max(0, this.metrics.http.requests.active - 1);
        if (shouldCountAsError) {
          this.metrics.http.requests.errors++;
          this.metrics.http.responses.error++;
        }

        // Update per-route stats
        const route = `${request.method} ${request.url}`;
        const routeStats = this.metrics.http.routes.get(route) || {
          requests: 0, errors: 0, avgTime: 0, totalTime: 0
        };
        routeStats.requests++;
        if (shouldCountAsError) routeStats.errors++;
        this.metrics.http.routes.set(route, routeStats);

        // Remove from active set and emit updated snapshot
        this.activeRequests.delete(id);
        const httpSnapshot = {
          ...this.metrics.http,
          routes: Object.fromEntries(this.metrics.http.routes)
        };
        this.emit('httpMetrics', httpSnapshot);
      }
    }
    
    for (const [id, query] of this.activeQueries) {
      if (now - query.startTime > timeout) {
        this.log('warn', 'DATABASE_QUERY_TIMEOUT', { queryId: id });
        this.activeQueries.delete(id);
        this.metrics.database.queries.active--;
      }
    }

    // Persist HTTP snapshot ~1Hz
    this.persistHttpMetric();
  }

  persistWebsocketMetric() {
    if (!this.db) return;
    const nowTs = Date.now();
    if (nowTs - this._lastWsPersistTs < 1000) return;
    this._lastWsPersistTs = nowTs;
    try {
      const ws = this.metrics.websocket;
      this.db.insertWebsocketMetric({
        ts: nowTs,
        active: ws.connections?.active || 0,
        total: ws.connections?.total || 0,
        msg_sent: ws.messages?.sent || 0,
        msg_recv: ws.messages?.received || 0,
        errors: ws.messages?.errors || 0
      }).catch(()=>{});
      const threeHoursAgo = nowTs - 3 * 60 * 60 * 1000;
      this.db.pruneOldWebsocketMetrics(threeHoursAgo).catch(()=>{});
    } catch {}
  }

  persistHttpMetric() {
    if (!this.db) return;
    const nowTs = Date.now();
    if (this._lastHttpPersistTs && nowTs - this._lastHttpPersistTs < 1000) return;
    this._lastHttpPersistTs = nowTs;
    const http = this.metrics.http;
    this.db.insertHttpMetric({
      ts: nowTs,
      active: http.requests?.active || 0,
      total: http.requests?.total || 0,
      errors: http.requests?.errors || 0,
      avg_rt: Math.round(http.requests?.avgResponseTime || 0)
    }).catch(()=>{});
    const cutoff = nowTs - 3 * 60 * 60 * 1000;
    this.db.pruneOldHttpMetrics(cutoff).catch(()=>{});
  }

  persistDbMetric() {
    if (!this.db) return;
    const nowTs = Date.now();
    if (this._lastDbPersistTs && nowTs - this._lastDbPersistTs < 1000) return;
    this._lastDbPersistTs = nowTs;
    const dbm = this.metrics.database;
    this.db.insertDbMetric({
      ts: nowTs,
      active: dbm.queries?.active || 0,
      total: dbm.queries?.total || 0,
      errors: dbm.queries?.errors || 0,
      avg_ms: Math.round(dbm.queries?.avgTime || 0)
    }).catch(()=>{});
    const cutoff = nowTs - 3 * 60 * 60 * 1000;
    this.db.pruneOldDbMetrics(cutoff).catch(()=>{});
  }

  persistAiMetric() {
    if (!this.db) return;
    const nowTs = Date.now();
    if (this._lastAiPersistTs && nowTs - this._lastAiPersistTs < 1000) return;
    this._lastAiPersistTs = nowTs;
    const aim = this.metrics.ai;
    this.db.insertAiMetric({
      ts: nowTs,
      avg_ms: Math.round(aim.avgResponseTime || 0),
      total: aim.requests?.total || 0,
      errors: aim.requests?.errors || 0
    }).catch(()=>{});
    const cutoff = nowTs - 3 * 60 * 60 * 1000;
    this.db.pruneOldAiMetrics(cutoff).catch(()=>{});
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