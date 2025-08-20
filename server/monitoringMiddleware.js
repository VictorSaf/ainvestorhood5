const realTimeMonitor = require('./realTimeMonitor');

/**
 * Middleware pentru monitorizarea HTTP requests
 */
function httpMonitoringMiddleware(req, res, next) {
  // Start monitoring
  const requestId = realTimeMonitor.startHttpRequest(req, res);
  
  // Add request ID to request object
  req.monitoringId = requestId;
  
  // Continue to next middleware
  next();
}

/**
 * Wrapper pentru monitorizarea query-urilor de baza de date
 */
function wrapDatabaseMethod(originalMethod, context) {
  return function(...args) {
    // Extract query from arguments
    const query = args[0] || 'Unknown query';
    const params = args[1] || [];
    
    // Start monitoring
    const queryId = realTimeMonitor.startDatabaseQuery(query, params);
    
    // Handle both callback and promise-based queries
    const lastArg = args[args.length - 1];
    
    if (typeof lastArg === 'function') {
      // Callback-based query
      const originalCallback = lastArg;
      args[args.length - 1] = function(error, result) {
        realTimeMonitor.endDatabaseQuery(queryId, error);
        originalCallback.call(this, error, result);
      };
      
      return originalMethod.apply(context, args);
      
    } else {
      // Promise-based query
      const result = originalMethod.apply(context, args);
      
      if (result && typeof result.then === 'function') {
        return result
          .then(res => {
            realTimeMonitor.endDatabaseQuery(queryId);
            return res;
          })
          .catch(error => {
            realTimeMonitor.endDatabaseQuery(queryId, error);
            throw error;
          });
      }
      
      // Synchronous query
      try {
        const syncResult = result;
        realTimeMonitor.endDatabaseQuery(queryId);
        return syncResult;
      } catch (error) {
        realTimeMonitor.endDatabaseQuery(queryId, error);
        throw error;
      }
    }
  };
}

/**
 * Wrapper pentru monitorizarea AI requests
 */
function wrapAIMethod(originalMethod, context) {
  return async function(...args) {
    const prompt = args[0] || 'Unknown prompt';
    const model = args[1] || 'gpt-4o-mini';
    
    const { requestId, startTime } = realTimeMonitor.startAIRequest(prompt, model);
    
    try {
      const result = await originalMethod.apply(context, args);
      
      // Extract token count if available
      const tokens = result?.usage?.total_tokens || 0;
      
      realTimeMonitor.endAIRequest(requestId, startTime, tokens);
      return result;
      
    } catch (error) {
      realTimeMonitor.endAIRequest(requestId, startTime, 0, error);
      throw error;
    }
  };
}

/**
 * Setup monitoring pentru un obiect Database
 */
function setupDatabaseMonitoring(db) {
  // Wrap common database methods
  const methodsToWrap = ['run', 'get', 'all', 'prepare', 'exec'];
  
  methodsToWrap.forEach(methodName => {
    if (db.db && typeof db.db[methodName] === 'function') {
      const originalMethod = db.db[methodName];
      db.db[methodName] = wrapDatabaseMethod(originalMethod, db.db);
    }
    
    // Also wrap direct methods on the db object
    if (typeof db[methodName] === 'function') {
      const originalMethod = db[methodName];
      db[methodName] = wrapDatabaseMethod(originalMethod, db);
    }
  });
  
  realTimeMonitor.log('info', 'DATABASE_MONITORING_SETUP', {
    wrappedMethods: methodsToWrap
  });
}

/**
 * Setup monitoring pentru un obiect AIService
 */
function setupAIServiceMonitoring(aiService) {
  // Wrap AI service methods
  const methodsToWrap = ['analyzeNews', 'analyzeNewsArticle', 'searchFinancialNews'];
  
  methodsToWrap.forEach(methodName => {
    if (typeof aiService[methodName] === 'function') {
      const originalMethod = aiService[methodName];
      aiService[methodName] = wrapAIMethod(originalMethod, aiService);
    }
  });
  
  realTimeMonitor.log('info', 'AI_SERVICE_MONITORING_SETUP', {
    wrappedMethods: methodsToWrap
  });
}

/**
 * Setup monitoring pentru WebSocket connections
 */
function setupWebSocketMonitoring(io) {
  io.on('connection', (socket) => {
    realTimeMonitor.onWebSocketConnection(socket);
    
    // Monitor custom events
    socket.on('custom-event', (data) => {
      realTimeMonitor.onWebSocketMessage(socket.id, 'received', 'custom-event', data);
    });
    
    // Wrap emit method to monitor outgoing messages
    const originalEmit = socket.emit;
    socket.emit = function(event, ...args) {
      realTimeMonitor.onWebSocketMessage(socket.id, 'sent', event, args);
      return originalEmit.apply(socket, [event, ...args]);
    };
    
    // Wrap broadcast methods
    const originalBroadcast = socket.broadcast.emit;
    socket.broadcast.emit = function(event, ...args) {
      realTimeMonitor.onWebSocketMessage('broadcast', 'sent', event, args);
      return originalBroadcast.apply(socket.broadcast, [event, ...args]);
    };
  });
  
  realTimeMonitor.log('info', 'WEBSOCKET_MONITORING_SETUP', {
    server: 'Socket.IO'
  });
}

/**
 * Setup monitoring pentru Scrapy service
 */
function setupScrapyMonitoring(scrapyService) {
  // Wrap runScraper method
  const originalRunScraper = scrapyService.runScraper;
  
  scrapyService.runScraper = async function(...args) {
    realTimeMonitor.onScrapingStart('scrapy');
    
    try {
      const result = await originalRunScraper.apply(this, args);
      const articlesProcessed = result.articlesProcessed || 0;
      const errors = result.success ? 0 : 1;
      realTimeMonitor.onScrapingEnd(articlesProcessed, errors, 'scrapy');
      return result;
    } catch (error) {
      realTimeMonitor.onScrapingEnd(0, 1, 'scrapy');
      throw error;
    }
  };
  
  realTimeMonitor.log('info', 'SCRAPY_MONITORING_SETUP', {
    service: 'ScrapyService'
  });
}

/**
 * Middleware pentru capturarea erorilor și logarea lor
 */
function errorMonitoringMiddleware(error, req, res, next) {
  realTimeMonitor.log('error', 'HTTP_ERROR', {
    requestId: req.monitoringId,
    error: error.message,
    stack: error.stack,
    url: req.url,
    method: req.method
  });
  
  next(error);
}

/**
 * Process monitoring
 */
function setupProcessMonitoring() {
  process.on('uncaughtException', (error) => {
    realTimeMonitor.log('error', 'UNCAUGHT_EXCEPTION', {
      error: error.message,
      stack: error.stack
    });
  });
  
  process.on('unhandledRejection', (reason, promise) => {
    realTimeMonitor.log('error', 'UNHANDLED_REJECTION', {
      reason: reason.toString(),
      promise: promise.toString()
    });
  });
  
  process.on('warning', (warning) => {
    realTimeMonitor.log('warn', 'PROCESS_WARNING', {
      name: warning.name,
      message: warning.message,
      stack: warning.stack
    });
  });
  
  realTimeMonitor.log('info', 'PROCESS_MONITORING_SETUP', {
    pid: process.pid,
    version: process.version
  });
}

/**
 * File system monitoring
 */
function setupFileSystemMonitoring() {
  const fs = require('fs');
  const path = require('path');
  
  // Monitor important files
  const filesToWatch = [
    path.join(__dirname, 'database.js'),
    path.join(__dirname, 'aiService.js'),
    path.join(__dirname, 'newsScheduler.js'),
    path.join(__dirname, 'ainvestorhood.db')
  ];
  
  filesToWatch.forEach(filePath => {
    if (fs.existsSync(filePath)) {
      fs.watchFile(filePath, (curr, prev) => {
        realTimeMonitor.log('info', 'FILE_CHANGED', {
          file: path.basename(filePath),
          modified: curr.mtime,
          size: curr.size
        });
      });
    }
  });
  
  realTimeMonitor.log('info', 'FILESYSTEM_MONITORING_SETUP', {
    watchedFiles: filesToWatch.length
  });
}

module.exports = {
  httpMonitoringMiddleware,
  errorMonitoringMiddleware,
  setupDatabaseMonitoring,
  setupAIServiceMonitoring,
  setupWebSocketMonitoring,
  setupScrapyMonitoring,
  setupProcessMonitoring,
  setupFileSystemMonitoring,
  wrapDatabaseMethod,
  wrapAIMethod
};