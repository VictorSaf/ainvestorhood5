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
    
    const { aiProvider, apiKey, ollamaModel, customPrompt } = req.body;
    
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
      console.log('✅ OpenAI configuration saved successfully');
      res.json({ success: true, message: 'OpenAI configuration saved successfully' });
      
    } else if (aiProvider === 'ollama') {
      if (!ollamaModel) {
        console.log('❌ No Ollama model provided');
        return res.status(400).json({ error: 'Ollama model is required' });
      }
      
      console.log('✅ Setting Ollama configuration...');
      await scheduler.setOllamaConfig(ollamaModel, customPrompt);
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

// Manually trigger news collection
app.post('/api/collect-news', async (req, res) => {
  try {
    await scheduler.runOnce();
    res.json({ success: true, message: 'News collection started' });
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

// Test Ollama model
app.post('/api/ollama/test', async (req, res) => {
  try {
    const { model } = req.body;
    if (!model) {
      return res.status(400).json({ error: 'Model name is required' });
    }
    
    const OllamaService = require('./ollamaService');
    const ollama = new OllamaService();
    
    const result = await ollama.testModel(model);
    res.json(result);
  } catch (error) {
    console.error('Error testing Ollama model:', error);
    res.status(500).json({ error: error.message });
  }
});

// Get current AI configuration
app.get('/api/ai-config', async (req, res) => {
  try {
    const aiProvider = await db.getSetting('ai_provider') || 'openai';
    const ollamaModel = await db.getSetting('ollama_model');
    const customPrompt = await db.getSetting('custom_prompt');
    const hasOpenAIKey = !!(await db.getSetting('openai_api_key'));
    
    res.json({
      aiProvider,
      ollamaModel,
      customPrompt,
      hasOpenAIKey
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

// Test OpenAI model
app.post('/api/openai/test', async (req, res) => {
  try {
    const apiKey = await db.getSetting('openai_api_key');
    if (!apiKey) {
      return res.status(400).json({ error: 'OpenAI API key not configured' });
    }
    
    const AIService = require('./aiService');
    const aiService = new AIService(apiKey, 'openai');
    
    const testResult = await aiService.testOpenAI();
    res.json(testResult);
  } catch (error) {
    console.error('Error testing OpenAI:', error);
    res.status(500).json({ error: error.message });
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
    
    if (aiProvider === 'ollama') {
      const OllamaService = require('./ollamaService');
      const ollama = new OllamaService();
      
      const result = await ollama.chatWithModel(model, message, customPrompt);
      response = result.response;
      tokens = result.tokens || 0;
    } else {
      const apiKey = await db.getSetting('openai_api_key');
      if (!apiKey) {
        return res.status(400).json({ error: 'OpenAI API key not configured' });
      }
      
      const AIService = require('./aiService');
      const aiService = new AIService(apiKey, 'openai', null, customPrompt);
      
      const result = await aiService.chatWithOpenAI(message);
      response = result.response;
      tokens = result.tokens?.total_tokens || 0;
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

// Stream chat with AI agent
app.post('/api/ai-chat-stream', async (req, res) => {
  try {
    const { message, aiProvider, model, customPrompt, socketId } = req.body;
    
    if (!message) {
      return res.status(400).json({ error: 'Message is required' });
    }
    
    if (!socketId) {
      return res.status(400).json({ error: 'Socket ID is required for streaming' });
    }
    
    const startTime = Date.now();
    let tokens = 0;
    
    if (aiProvider === 'ollama') {
      const OllamaService = require('./ollamaService');
      const ollama = new OllamaService();
      
      const result = await ollama.streamChatWithModel(model, message, customPrompt, (chunk, isDone) => {
        if (isDone) {
          // Completion will be handled after the promise resolves
          // Just notify that streaming is done
        } else if (chunk) {
          // Send chunk event
          io.emit('ai-chat-chunk', { 
            socketId, 
            chunk, 
            timestamp: new Date().toISOString() 
          });
        }
      });
      
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
      // For OpenAI, we can implement streaming later if needed
      return res.status(400).json({ error: 'Streaming not yet implemented for OpenAI' });
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