const express = require('express');
const cors = require('cors');
const path = require('path');
const { createServer } = require('http');
const { Server } = require('socket.io');
require('dotenv').config();
const Database = require('./database');
const NewsScheduler = require('./newsScheduler');
const monitoring = require('./monitoring');
const liveStream = require('./liveStream');
const realTimeMonitor = require('./realTimeMonitor');
const { 
  httpMonitoringMiddleware, 
  errorMonitoringMiddleware,
  setupDatabaseMonitoring,
  setupAIServiceMonitoring,
  setupWebSocketMonitoring,
  setupScrapyMonitoring,
  setupProcessMonitoring,
  setupFileSystemMonitoring
} = require('./monitoringMiddleware');

const app = express();
const PORT = process.env.PORT || 8080;

// Create HTTP server and Socket.IO
const server = createServer(app);
const io = new Server(server, {
  cors: {
    origin: ["http://localhost:3000", "http://192.168.10.30:3000"],
    methods: ["GET", "POST"]
  }
});

// Initialize database and scheduler
const db = new Database();
const scheduler = new NewsScheduler();

// Setup monitoring for services
setupDatabaseMonitoring(db);
setupWebSocketMonitoring(io);
setupScrapyMonitoring(scheduler.scrapyService);

// Initialize monitoring and live stream
monitoring.init(io);
liveStream.init(io);

// Start real-time monitoring
realTimeMonitor.start();

// Setup process and system monitoring
setupProcessMonitoring();
setupFileSystemMonitoring();

// GLOBAL REQUEST TIMEOUT - applies to ALL requests (API + static files)
const GLOBAL_TIMEOUT = 15000; // 15 seconds max for ANY request
const API_TIMEOUT = 30000; // 30 seconds max for API requests specifically

app.use((req, res, next) => {
  const isApiRequest = req.url.startsWith('/api');
  const timeout = isApiRequest ? API_TIMEOUT : GLOBAL_TIMEOUT;
  
  // Set aggressive timeout for all requests
  const timeoutId = setTimeout(() => {
    console.warn(`⚠️ REQUEST TIMEOUT: ${req.method} ${req.url} (${timeout}ms)`);
    
    if (!res.headersSent) {
      if (isApiRequest) {
        res.status(408).json({ 
          error: 'Request timeout', 
          message: `Request took longer than ${timeout/1000} seconds`,
          timeout: timeout,
          url: req.url 
        });
      } else {
        // For static files, send simple text response
        res.status(408).send(`Request timeout: ${req.url} took too long to process`);
      }
    }
    
    // Force close the connection
    try {
      res.destroy();
    } catch (e) {
      console.warn('Failed to destroy response:', e.message);
    }
  }, timeout);
  
  // Clear timeout when response finishes
  res.on('finish', () => {
    clearTimeout(timeoutId);
  });
  
  res.on('close', () => {
    clearTimeout(timeoutId);
  });
  
  next();
});

// Additional API-specific timeout middleware
app.use('/api', (req, res, next) => {
  // Additional monitoring for API requests
  const startTime = Date.now();
  
  res.on('finish', () => {
    const duration = Date.now() - startTime;
    if (duration > 5000) {
      console.warn(`🐌 SLOW API REQUEST: ${req.method} ${req.url} - ${duration}ms`);
    }
  });
  
  next();
});

// Middleware
app.use(cors());
app.use(express.json());
app.use(httpMonitoringMiddleware);

// Serve static files from React build (only in production)
if (process.env.NODE_ENV === 'production') {
  app.use(express.static(path.join(__dirname, '../client/build')));
}

// API Routes

// Check setup status
app.get('/api/setup-status', async (req, res) => {
  try {
    const aiProvider = await db.getSetting('ai_provider') || 'openai';
    let hasConfig = false;
    
    if (aiProvider === 'openai') {
      const apiKey = await db.getSetting('openai_api_key');
      hasConfig = !!apiKey;
    } else if (aiProvider === 'ollama') {
      const ollamaModel = await db.getSetting('ollama_model');
      hasConfig = !!ollamaModel;
    }
    
    res.json({ 
      hasApiKey: hasConfig, // Keep for compatibility
      hasConfig: hasConfig,
      aiProvider: aiProvider 
    });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Setup AI configuration
app.post('/api/setup', async (req, res) => {
  try {
    console.log('📥 Received setup request:', { 
      body: req.body, 
      headers: req.headers['content-type'] 
    });
    
    const { aiProvider, apiKey, ollamaModel, customPrompt, tokenLimits } = req.body;
    
    if (aiProvider === 'openai') {
      if (!apiKey) {
        console.log('❌ No API key provided for OpenAI');
        return res.status(400).json({ error: 'OpenAI API key is required' });
      }
      
      console.log('✅ Setting OpenAI configuration...');
      await scheduler.setApiKey(apiKey);
      if (customPrompt) {
        await db.setSetting('custom_prompt', customPrompt);
      }
      if (tokenLimits) {
        await db.setSetting('token_limits', JSON.stringify(tokenLimits));
        console.log('✅ Token limits saved:', tokenLimits);
      }
      console.log('✅ OpenAI configuration saved successfully');
      res.json({ success: true, message: 'OpenAI configuration saved successfully' });
      
    } else if (aiProvider === 'ollama') {
      if (!ollamaModel) {
        console.log('❌ No Ollama model provided');
        return res.status(400).json({ error: 'Ollama model is required' });
      }
      
      console.log('✅ Setting Ollama configuration...');
      await scheduler.setOllamaConfig(ollamaModel, customPrompt);
      if (tokenLimits) {
        await db.setSetting('token_limits', JSON.stringify(tokenLimits));
        console.log('✅ Token limits saved:', tokenLimits);
      }
      console.log('✅ Ollama configuration saved successfully');
      res.json({ success: true, message: 'Ollama configuration saved successfully' });
      
    } else {
      return res.status(400).json({ error: 'Invalid AI provider' });
    }
    
  } catch (error) {
    console.error('❌ Setup error:', error);
    res.status(500).json({ error: error.message });
  }
});

// Get recent news articles
app.get('/api/news', async (req, res) => {
  try {
    const limit = parseInt(req.query.limit) || 50;
    const articles = await db.getRecentArticles(limit);
    console.log(`📡 API: Serving ${articles.length} articles to frontend`);
    
    // Monitor API activity
    monitoring.onApiRequest('/api/news', articles.length);
    
    res.json(articles);
  } catch (error) {
    console.error('API Error:', error);
    res.status(500).json({ error: error.message });
  }
});

// Manually trigger news collection - ASYNC (non-blocking)
app.post('/api/collect-news', async (req, res) => {
  try {
    // Return immediately without waiting for completion
    res.json({ success: true, message: 'News collection started', status: 'running' });
    
    // Run collection asynchronously in background
    scheduler.runOnce().catch(error => {
      console.error('Background news collection failed:', error);
      // Emit error to WebSocket clients for real-time updates
      io.emit('newsCollectionError', { error: error.message, timestamp: new Date().toISOString() });
    });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Populate feed with sample articles for demo
app.post('/api/populate-feed', async (req, res) => {
  try {
    const sampleArticles = [
      {
        title: 'AI Revolution Transforms Financial Trading',
        summary: 'Artificial Intelligence algorithms now handle 85% of high-frequency trading, revolutionizing market dynamics and efficiency.',
        instrument_type: 'stocks',
        instrument_name: 'AI_SECTOR',
        recommendation: 'BUY',
        confidence_score: 91,
        source_url: 'https://example.com/ai-trading',
        content_hash: `hash-ai-${Date.now()}`,
        published_at: new Date().toISOString()
      },
      {
        title: 'Quantum Computing Stocks Surge 40%',
        summary: 'Quantum computing companies see massive gains following breakthrough in error correction technology.',
        instrument_type: 'stocks',
        instrument_name: 'QUANTUM',
        recommendation: 'BUY',
        confidence_score: 87,
        source_url: 'https://example.com/quantum-surge',
        content_hash: `hash-quantum-${Date.now()}`,
        published_at: new Date().toISOString()
      },
      {
        title: 'Central Bank Digital Currencies Gain Momentum',
        summary: 'Multiple central banks accelerate CBDC development as digital payments reshape global finance.',
        instrument_type: 'crypto',
        instrument_name: 'CBDC',
        recommendation: 'BUY',
        confidence_score: 76,
        source_url: 'https://example.com/cbdc-momentum',
        content_hash: `hash-cbdc-${Date.now()}`,
        published_at: new Date().toISOString()
      }
    ];

    let addedCount = 0;
    for (const article of sampleArticles) {
      try {
        await db.addArticle(article);
        addedCount++;
      } catch (error) {
        console.log(`Skipped duplicate article: ${article.title}`);
      }
    }

    res.json({ 
      success: true, 
      message: `Added ${addedCount} new articles to feed`,
      articlesAdded: addedCount
    });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Real-time monitoring endpoints
app.get('/api/monitor/metrics', (req, res) => {
  try {
    const metrics = realTimeMonitor.getAllMetrics();
    res.json(metrics);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

app.get('/api/monitor/metrics/:category', (req, res) => {
  try {
    const category = req.params.category;
    const metrics = realTimeMonitor.getMetrics(category);
    
    if (!metrics) {
      return res.status(404).json({ error: 'Metrics category not found' });
    }
    
    res.json(metrics);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

app.get('/api/monitor/logs', (req, res) => {
  try {
    const { level, limit = 100, event } = req.query;
    const logs = realTimeMonitor.getLogs(level, parseInt(limit), event);
    res.json(logs);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Get statistics
app.get('/api/stats', async (req, res) => {
  try {
    const articles = await db.getRecentArticles(1000);
    const stats = {
      totalArticles: articles.length,
      byInstrument: {},
      byRecommendation: { BUY: 0, SELL: 0, HOLD: 0 },
      averageConfidence: 0
    };

    let totalConfidence = 0;
    articles.forEach(article => {
      // Count by instrument type
      stats.byInstrument[article.instrument_type] = (stats.byInstrument[article.instrument_type] || 0) + 1;
      
      // Count by recommendation
      stats.byRecommendation[article.recommendation]++;
      
      // Sum confidence scores
      totalConfidence += article.confidence_score;
    });

    if (articles.length > 0) {
      stats.averageConfidence = Math.round(totalConfidence / articles.length);
    }

    res.json(stats);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});


// Error handling middleware
app.use((error, req, res, next) => {
  console.error('Server Error:', error);
  res.status(500).json({ error: 'Internal server error' });
});

// Add monitoring endpoint
app.get('/api/monitoring', (req, res) => {
  const healthStatus = monitoring.getHealthStatus();
  res.json(healthStatus);
});

// Get Ollama models
app.get('/api/ollama/models', async (req, res) => {
  try {
    const OllamaService = require('./ollamaService');
    const ollama = new OllamaService();
    
    const isRunning = await ollama.isOllamaRunning();
    if (!isRunning) {
      return res.json({ 
        success: false, 
        error: 'Ollama is not running', 
        models: [] 
      });
    }
    
    const models = await ollama.getAvailableModels();
    res.json({ 
      success: true, 
      models: models,
      ollamaRunning: true 
    });
  } catch (error) {
    console.error('Error fetching Ollama models:', error);
    res.json({ 
      success: false, 
      error: error.message, 
      models: [],
      ollamaRunning: false 
    });
  }
});

// Test Ollama model - WITH TIMEOUT
app.post('/api/ollama/test', async (req, res) => {
  try {
    const { model } = req.body;
    if (!model) {
      return res.status(400).json({ error: 'Model name is required' });
    }
    
    const OllamaService = require('./ollamaService');
    const ollama = new OllamaService();
    
    // Get token limits from database
    const tokenLimitsStr = await db.getSetting('token_limits');
    const tokenLimits = tokenLimitsStr ? JSON.parse(tokenLimitsStr) : { test: 50 };
    
    // Set aggressive timeout for Ollama test (10 seconds max)
    const OLLAMA_TEST_TIMEOUT = 10000;
    const timeoutPromise = new Promise((_, reject) => 
      setTimeout(() => reject(new Error('Ollama test timeout')), OLLAMA_TEST_TIMEOUT)
    );
    
    const result = await Promise.race([
      ollama.testModel(model, "Hello", tokenLimits.test),
      timeoutPromise
    ]);
    
    res.json(result);
  } catch (error) {
    console.error('Error testing Ollama model:', error);
    if (error.message.includes('timeout')) {
      res.status(408).json({ 
        success: false, 
        error: 'Ollama test timeout', 
        message: 'Ollama model test took too long. Check if Ollama is running and responsive.',
        model: req.body.model
      });
    } else {
      res.status(500).json({ error: error.message });
    }
  }
});

// Get current AI configuration
app.get('/api/ai-config', async (req, res) => {
  try {
    const aiProvider = await db.getSetting('ai_provider') || 'openai';
    const ollamaModel = await db.getSetting('ollama_model');
    const customPrompt = await db.getSetting('custom_prompt');
    const hasOpenAIKey = !!(await db.getSetting('openai_api_key'));
    const tokenLimitsStr = await db.getSetting('token_limits');
    let tokenLimits = {
      chat: 1000,
      analysis: 800,
      streaming: 1000,
      test: 50
    };
    
    if (tokenLimitsStr) {
      const savedLimits = JSON.parse(tokenLimitsStr);
      tokenLimits = { ...tokenLimits, ...savedLimits };
    }
    
    res.json({
      aiProvider,
      ollamaModel,
      customPrompt,
      hasOpenAIKey,
      tokenLimits
    });
  } catch (error) {
    console.error('Error getting AI config:', error);
    res.status(500).json({ error: error.message });
  }
});

// Get detailed model information
app.post('/api/ollama/model-details', async (req, res) => {
  try {
    const { model } = req.body;
    if (!model) {
      return res.status(400).json({ error: 'Model name is required' });
    }
    
    const OllamaService = require('./ollamaService');
    const ollama = new OllamaService();
    
    const details = await ollama.getModelDetails(model);
    res.json({ success: true, details });
  } catch (error) {
    console.error('Error getting model details:', error);
    res.json({ success: false, error: error.message });
  }
});

// Get AI metrics
app.get('/api/ai-metrics', async (req, res) => {
  try {
    const metrics = realTimeMonitor.getMetrics('ai');
    res.json(metrics);
  } catch (error) {
    console.error('Error getting AI metrics:', error);
    res.status(500).json({ error: error.message });
  }
});


// Test OpenAI model - WITH TIMEOUT
app.post('/api/openai/test', async (req, res) => {
  try {
    const apiKey = await db.getSetting('openai_api_key');
    if (!apiKey) {
      return res.status(400).json({ error: 'OpenAI API key not configured' });
    }
    
    const AIService = require('./aiService');
    const aiService = new AIService(apiKey, 'openai');
    
    // Set aggressive timeout for OpenAI test (8 seconds max)
    const OPENAI_TEST_TIMEOUT = 8000;
    const timeoutPromise = new Promise((_, reject) => 
      setTimeout(() => reject(new Error('OpenAI test timeout')), OPENAI_TEST_TIMEOUT)
    );
    
    const testResult = await Promise.race([
      aiService.testOpenAI(),
      timeoutPromise
    ]);
    
    res.json(testResult);
  } catch (error) {
    console.error('Error testing OpenAI:', error);
    if (error.message.includes('timeout')) {
      res.status(408).json({ 
        success: false, 
        error: 'OpenAI test timeout', 
        message: 'OpenAI API test took too long. Check your internet connection and API key.',
        timeout: 8000
      });
    } else {
      res.status(500).json({ error: error.message });
    }
  }
});

// Chat with AI agent
app.post('/api/ai-chat', async (req, res) => {
  try {
    const { message, aiProvider, model, customPrompt } = req.body;
    
    if (!message) {
      return res.status(400).json({ error: 'Message is required' });
    }
    
    const startTime = Date.now();
    let response;
    let tokens = 0;
    
    // Set aggressive timeout for AI requests (15 seconds max)
    const AI_REQUEST_TIMEOUT = 15000;
    const timeoutPromise = new Promise((_, reject) => 
      setTimeout(() => reject(new Error('AI request timeout - response took too long')), AI_REQUEST_TIMEOUT)
    );
    
    try {
      if (aiProvider === 'ollama') {
        const OllamaService = require('./ollamaService');
        const ollama = new OllamaService();
        
        const result = await Promise.race([
          ollama.chatWithModel(model, message, customPrompt),
          timeoutPromise
        ]);
        response = result.response;
        tokens = result.tokens || 0;
      } else {
        const apiKey = await db.getSetting('openai_api_key');
        if (!apiKey) {
          return res.status(400).json({ error: 'OpenAI API key not configured' });
        }
        
        const AIService = require('./aiService');
        const aiService = new AIService(apiKey, 'openai', null, customPrompt);
        
        const result = await Promise.race([
          aiService.chatWithOpenAI(message),
          timeoutPromise
        ]);
        response = result.response;
        tokens = result.tokens?.total_tokens || 0;
      }
    } catch (timeoutError) {
      if (timeoutError.message.includes('timeout')) {
        console.warn(`AI request timeout for ${aiProvider}:`, message.substring(0, 50));
        return res.status(408).json({ 
          error: 'Request timeout', 
          message: 'AI response took too long. Try a shorter message or try again later.',
          timeout: AI_REQUEST_TIMEOUT 
        });
      }
      throw timeoutError;
    }
    
    const processingTime = Date.now() - startTime;
    
    // Update AI metrics
    realTimeMonitor.recordAIRequest(aiProvider, processingTime, tokens);
    
    res.json({
      response,
      processingTime,
      timestamp: new Date().toISOString(),
      tokens
    });
  } catch (error) {
    console.error('Error in AI chat:', error);
    res.status(500).json({ error: error.message });
  }
});

// Stream chat with AI agent - INSTANT RESPONSE
app.post('/api/ai-chat-stream', async (req, res) => {
  try {
    const { message, aiProvider, model, customPrompt, socketId } = req.body;
    
    if (!message) {
      return res.status(400).json({ error: 'Message is required' });
    }
    
    if (!socketId) {
      return res.status(400).json({ error: 'Socket ID is required for streaming' });
    }
    
    // Return immediately - streaming happens via WebSocket
    res.json({ success: true, message: 'Streaming started', socketId, timestamp: new Date().toISOString() });
    
    const startTime = Date.now();
    let tokens = 0;
    
    // Set aggressive timeout for streaming (20 seconds max)
    const STREAM_TIMEOUT = 20000;
    const timeoutPromise = new Promise((_, reject) => 
      setTimeout(() => reject(new Error('Streaming timeout')), STREAM_TIMEOUT)
    );
    
    try {
      if (aiProvider === 'ollama') {
        const OllamaService = require('./ollamaService');
        const ollama = new OllamaService();
        
        const result = await Promise.race([
          ollama.streamChatWithModel(model, message, customPrompt, (chunk, isDone) => {
            if (isDone) {
              // Completion will be handled after the promise resolves
            } else if (chunk) {
              // Send chunk event
              io.emit('ai-chat-chunk', { 
                socketId, 
                chunk, 
                timestamp: new Date().toISOString() 
              });
            }
          }),
          timeoutPromise
        ]);
        
        tokens = result.tokens || 0;
        
        if (!result.success) {
          throw new Error(result.error || 'Streaming failed');
        }
        
        // Send completion event after we have the result
        const processingTime = Date.now() - startTime;
        io.emit('ai-chat-complete', { 
          socketId, 
          processingTime, 
          tokens 
        });
      
      } else {
        // OpenAI streaming not implemented - send error via WebSocket
        io.emit('ai-chat-error', { 
          socketId, 
          error: 'Streaming not yet implemented for OpenAI',
          timestamp: new Date().toISOString() 
        });
        return; // Exit early since we already sent response
      }
    } catch (error) {
      console.error('Streaming error:', error);
      // Send error via WebSocket instead of HTTP response
      io.emit('ai-chat-error', { 
        socketId, 
        error: error.message.includes('timeout') ? 'Streaming timeout - response took too long' : error.message,
        timestamp: new Date().toISOString() 
      });
    }
    
    const processingTime = Date.now() - startTime;
    
    // Update AI metrics
    realTimeMonitor.recordAIRequest(aiProvider, processingTime, tokens);
    
    res.json({
      success: true,
      message: 'Streaming completed',
      processingTime,
      timestamp: new Date().toISOString(),
      tokens
    });
    
  } catch (error) {
    console.error('Error in streaming AI chat:', error);
    
    // Send error through WebSocket if we have a socketId
    if (req.body.socketId) {
      io.emit('ai-chat-error', { 
        socketId: req.body.socketId, 
        error: error.message 
      });
    }
    
    res.status(500).json({ error: error.message });
  }
});

// RSS Sources endpoint for monitoring dashboard
app.get('/api/rss-sources', async (req, res) => {
  try {
    const limit = parseInt(req.query.limit) || 100;
    
    // Get RSS feed statistics from the database
    const articles = await db.getRecentArticles(limit);
    
    // RSS feeds that we collect from (from aiService.js)
    const rssFeeds = [
      { domain: 'zerohedge.com', feed: 'https://feeds.feedburner.com/zerohedge/feed', name: 'ZeroHedge' },
      { domain: 'seekingalpha.com', feed: 'https://seekingalpha.com/feed.xml', name: 'Seeking Alpha' },
      { domain: 'motleyfool.com', feed: 'https://feeds.feedburner.com/TheMotleyFool', name: 'The Motley Fool' },
      { domain: 'investing.com', feed: 'https://www.investing.com/rss/news.rss', name: 'Investing.com' },
      { domain: 'cnn.com', feed: 'https://rss.cnn.com/rss/money_latest.rss', name: 'CNN Business' },
      { domain: 'npr.org', feed: 'https://feeds.npr.org/1003/rss.xml', name: 'NPR Business' },
      { domain: 'washingtonpost.com', feed: 'https://feeds.washingtonpost.com/rss/business', name: 'Washington Post Business' },
      { domain: 'nasdaq.com', feed: 'https://www.nasdaq.com/feed/rssoutbound?category=US%20Markets', name: 'NASDAQ' },
      { domain: 'yahoo.com', feed: 'https://feeds.finance.yahoo.com/rss/2.0/headline', name: 'Yahoo Finance' },
      { domain: 'bloomberg.com', feed: 'https://feeds.bloomberg.com/markets/news.rss', name: 'Bloomberg' },
      { domain: 'marketwatch.com', feed: 'https://www.marketwatch.com/rss/topstories', name: 'MarketWatch' },
      { domain: 'reuters.com', feed: 'https://feeds.reuters.com/reuters/businessNews', name: 'Reuters Business' },
      { domain: 'cointelegraph.com', feed: 'https://cointelegraph.com/rss', name: 'Cointelegraph' },
      { domain: 'coindesk.com', feed: 'https://feeds.feedburner.com/CoinDesk', name: 'CoinDesk' },
      { domain: 'decrypt.co', feed: 'https://decrypt.co/feed', name: 'Decrypt' }
    ];

    // Count articles by source domain
    const sourceStats = {};
    articles.forEach(article => {
      if (article.source_url) {
        try {
          const domain = new URL(article.source_url).hostname.replace('www.', '');
          sourceStats[domain] = (sourceStats[domain] || 0) + 1;
        } catch (e) {
          // Skip invalid URLs
        }
      }
    });

    // Create sources with counts
    const sources = rssFeeds.map(feed => {
      const domainArticles = articles.filter(a => a.source_url && a.source_url.includes(feed.domain));
      const sortedDates = domainArticles.map(a => a.created_at).sort();
      
      return {
        domain: feed.domain,
        feed_url: feed.feed,
        name: feed.name,
        articles_count: sourceStats[feed.domain] || 0,
        first_scraped: sortedDates.length > 0 ? sortedDates[0] : null,
        last_scraped: sortedDates.length > 0 ? sortedDates[sortedDates.length - 1] : null
      };
    });

    // Calculate statistics
    const statistics = {
      total_unique_sources: sources.length,
      total_articles: articles.length,
      active_sources: sources.filter(s => s.articles_count > 0).length,
      date_range: {
        first: articles.length > 0 ? articles[articles.length - 1].created_at : null,
        last: articles.length > 0 ? articles[0].created_at : null
      }
    };

    res.json({
      sources: sources.slice(0, limit),
      statistics
    });

  } catch (error) {
    console.error('Error fetching RSS sources:', error);
    res.status(500).json({ error: 'Failed to fetch RSS sources' });
  }
});

// Theme management endpoints
app.get('/api/theme', async (req, res) => {
  try {
    const theme = await db.getSetting('currentTheme');
    if (theme) {
      res.json(JSON.parse(theme));
    } else {
      // Return default theme if none exists
      const defaultTheme = require('../client/src/theme/defaultTheme.json');
      res.json(defaultTheme);
    }
  } catch (error) {
    console.error('Error fetching theme:', error);
    res.status(500).json({ error: 'Failed to fetch theme' });
  }
});

app.post('/api/theme', async (req, res) => {
  try {
    const themeData = req.body;
    
    // Validate theme data
    if (!themeData || !themeData.name || !themeData.version) {
      return res.status(400).json({ error: 'Invalid theme data' });
    }
    
    // Save theme to database
    await db.setSetting('currentTheme', JSON.stringify(themeData));
    await db.setSetting('themeLastUpdated', new Date().toISOString());
    
    // Emit theme update to all connected clients
    io.emit('theme-updated', themeData);
    
    res.json({ 
      success: true, 
      message: 'Theme saved successfully',
      timestamp: new Date().toISOString()
    });
  } catch (error) {
    console.error('Error saving theme:', error);
    res.status(500).json({ error: 'Failed to save theme' });
  }
});

app.delete('/api/theme', async (req, res) => {
  try {
    // Reset to default theme
    await db.deleteSetting('currentTheme');
    await db.deleteSetting('themeLastUpdated');
    
    // Load default theme
    const defaultTheme = require('../client/src/theme/defaultTheme.json');
    
    // Emit theme reset to all connected clients
    io.emit('theme-updated', defaultTheme);
    
    res.json({ 
      success: true, 
      message: 'Theme reset to default',
      theme: defaultTheme
    });
  } catch (error) {
    console.error('Error resetting theme:', error);
    res.status(500).json({ error: 'Failed to reset theme' });
  }
});

// Setup monitoring event broadcasting via WebSocket
realTimeMonitor.on('systemMetrics', (data) => {
  io.emit('systemMetrics', data);
});

realTimeMonitor.on('httpMetrics', (data) => {
  io.emit('httpMetrics', data);
});

realTimeMonitor.on('websocketMetrics', (data) => {
  io.emit('websocketMetrics', data);
});

realTimeMonitor.on('databaseMetrics', (data) => {
  io.emit('databaseMetrics', data);
});

realTimeMonitor.on('aiMetrics', (data) => {
  io.emit('aiMetrics', data);
});

realTimeMonitor.on('scrapyMetrics', (data) => {
  io.emit('scrapyMetrics', data);
});

realTimeMonitor.on('log', (logEntry) => {
  io.emit('log', logEntry);
});

// Forward slow request warnings to WebSocket clients
realTimeMonitor.on('slowRequest', (data) => {
  io.emit('slowRequest', data);
  console.warn(`🐌 SLOW REQUEST: ${data.method} ${data.url} - ${data.duration}ms`);
});

// Forward cleanup events to WebSocket clients
realTimeMonitor.on('cleanup', (data) => {
  io.emit('monitoringCleanup', data);
  console.warn(`🧹 MONITORING CLEANUP: ${data.requests} requests, ${data.queries} queries removed`);
});

// Catch all handler for React app (only in production) - MUST BE LAST!
if (process.env.NODE_ENV === 'production') {
  app.get('*', (req, res) => {
    res.sendFile(path.join(__dirname, '../client/build', 'index.html'));
  });
}

// Start server
server.listen(PORT, async () => {
  console.log(`Server running on port ${PORT}`);
  
  // Initialize scheduler
  await scheduler.init();
  
  console.log('✅ AIInvestorHood5 server is ready!');
  console.log(`📱 Open http://localhost:${PORT} to access the app`);
  console.log(`📊 Monitoring available via WebSocket`);
});

// Graceful shutdown
process.on('SIGTERM', () => {
  console.log('Shutting down gracefully...');
  scheduler.stop();
  db.close();
  process.exit(0);
});

process.on('SIGINT', () => {
  console.log('Shutting down gracefully...');
  scheduler.stop();
  db.close();
  process.exit(0);
});