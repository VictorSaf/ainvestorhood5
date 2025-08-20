const express = require('express');
const cors = require('cors');
const compression = require('compression');
const path = require('path');
const fs = require('fs');
const { createServer } = require('http');
const { Server } = require('socket.io');
require('dotenv').config();
const Database = require('./database');
const NewsScheduler = require('./newsScheduler');
const UnifiedScrapingService = require('./unifiedScrapingService');
const monitoring = require('./monitoring');
const liveStream = require('./liveStream');
const realTimeMonitor = require('./realTimeMonitor');
const { resolveYahooSymbol } = require('./yahooResolver');
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
const scrapingService = new UnifiedScrapingService();

// Make scheduler globally accessible for API endpoints
global.newsScheduler = scheduler;

// Setup monitoring for services
setupDatabaseMonitoring(db);
setupWebSocketMonitoring(io);
setupScrapyMonitoring(scheduler.scrapyService);

// Initialize monitoring and live stream
monitoring.init(io);
liveStream.init(io);

// Setup database for real-time monitoring
realTimeMonitor.setDatabase(db);

// Start real-time monitoring
realTimeMonitor.start();
browserPool.init().catch(()=>{});

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
app.use(compression()); // Add gzip compression for better performance
app.use(express.json());
try { app.use(require('compression')()); } catch {}
// Align monitor timeout with server expectations
process.env.MONITOR_HTTP_TIMEOUT_MS = process.env.MONITOR_HTTP_TIMEOUT_MS || '20000';

// Serve favicon early to avoid 404 noise
app.get('/favicon.ico', (req, res) => res.status(204).end());

// --- Analyze endpoint performance guards (concurrency + circuit breaker) ---
const ANALYZE_MAX_CONCURRENT = parseInt(process.env.ANALYZE_MAX_CONCURRENT || '2');
let analyzeActive = 0;
let analyzeFailures = 0;
let analyzeCircuitOpenUntil = 0;
const ANALYZE_CB_WINDOW_MS = 30000; // within last 30s
const ANALYZE_CB_THRESHOLD = 3;     // if >=3 failures -> open circuit for cooldown
const ANALYZE_CB_COOLDOWN_MS = 30000;

function recordAnalyzeFailure() {
  analyzeFailures++;
  setTimeout(() => { analyzeFailures = Math.max(0, analyzeFailures - 1); }, ANALYZE_CB_WINDOW_MS);
  if (analyzeFailures >= ANALYZE_CB_THRESHOLD) {
    analyzeCircuitOpenUntil = Date.now() + ANALYZE_CB_COOLDOWN_MS;
  }
}
app.use(httpMonitoringMiddleware);

// Serve static files from React build with caching
app.use(express.static(path.join(__dirname, '../client/build'), {
  maxAge: '1d', // Cache static files for 1 day
  etag: true,
  lastModified: true
}));

// Prevent favicon 404 from polluting error metrics
app.get('/favicon.ico', (req, res) => res.status(204).end());

// API Routes
// Quick parse an RSS/Atom URL using feedparser (debug/utility for System / Scrapping)
app.post('/api/scraping/parse-feed', async (req, res) => {
  try {
    const { url } = req.body || {};
    if (!url) return res.status(400).json({ success: false, error: 'url required' });
    const axios = require('axios');
    const r = await axios.get(url, { responseType: 'stream', timeout: 10000, headers: {
      'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
      'Accept': 'application/rss+xml,application/xml;q=0.9,text/html;q=0.8,*/*;q=0.7'
    }});
    const feedparser = new FeedParser();
    const items = [];
    await new Promise((resolve, reject) => {
      r.data.pipe(feedparser);
      feedparser.on('error', reject);
      feedparser.on('readable', function() {
        let item; while (item = this.read()) {
          items.push({ title: item.title, link: item.link, pubDate: item.pubDate });
        }
      });
      feedparser.on('end', resolve);
    });
    res.json({ success: true, count: items.length, items: items.slice(0, 50) });
  } catch (e) {
    res.status(500).json({ success: false, error: e.message });
  }
});
// Get AI runtime settings (tokens, intervals)
app.get('/api/ai-settings', async (req, res) => {
  try {
    const analysisTokens = parseInt(await db.getSetting('ollama_num_predict')) || parseInt(process.env.OLLAMA_NUM_PREDICT || '160');
    const chatTokens = parseInt(await db.getSetting('ollama_chat_num_predict')) || parseInt(process.env.OLLAMA_CHAT_NUM_PREDICT || '64');
    const minIntervalSec = parseInt(await db.getSetting('analysis_min_interval_sec')) || 30;
    res.json({ analysisTokens, chatTokens, minIntervalSec });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// Update AI runtime settings
app.post('/api/ai-settings', async (req, res) => {
  try {
    const { analysisTokens, chatTokens, minIntervalSec } = req.body || {};
    if (analysisTokens) {
      await db.setSetting('ollama_num_predict', String(parseInt(analysisTokens)));
      process.env.OLLAMA_NUM_PREDICT = String(parseInt(analysisTokens));
    }
    if (chatTokens) {
      await db.setSetting('ollama_chat_num_predict', String(parseInt(chatTokens)));
      process.env.OLLAMA_CHAT_NUM_PREDICT = String(parseInt(chatTokens));
    }
    if (minIntervalSec) {
      await db.setSetting('analysis_min_interval_sec', String(parseInt(minIntervalSec)));
    }
    res.json({ success: true });
  } catch (e) {
    res.status(400).json({ success: false, error: e.message });
  }
});
// Set runtime performance knobs (CPU threads, predict length) without rebuild
app.post('/api/perf/config', async (req, res) => {
  try {
    const { numThreads, numPredict } = req.body || {};
    if (numThreads) process.env.OLLAMA_NUM_THREAD = String(numThreads);
    if (numPredict) process.env.OLLAMA_NUM_PREDICT = String(numPredict);
    res.json({ success: true, numThreads: process.env.OLLAMA_NUM_THREAD, numPredict: process.env.OLLAMA_NUM_PREDICT });
  } catch (e) {
    res.status(400).json({ success: false, error: e.message });
  }
});

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
// Simple in-memory cache for hot GET endpoints
const responseCache = new Map();
const cacheGet = (key, maxAgeMs) => {
  const it = responseCache.get(key);
  if (!it) return null;
  if (Date.now() - it.ts > maxAgeMs) { responseCache.delete(key); return null; }
  return it.data;
};
const cacheSet = (key, data) => { responseCache.set(key, { ts: Date.now(), data }); };

app.get('/api/news', async (req, res) => {
  try {
    const limit = parseInt(req.query.limit) || 50;
    const cacheKey = `/api/news?limit=${limit}`;
    const cached = cacheGet(cacheKey, 5000);
    if (cached) return res.json(cached);
    // Backend guarantee: only return articles with valid instrument
    const articles = (await db.getRecentArticles(limit)).filter(a => a.instrument_name && String(a.instrument_name).trim().length > 0);
    console.log(`📡 API: Serving ${articles.length} articles to frontend`);
    
    // Monitor API activity
    monitoring.onApiRequest('/api/news', articles.length);
    
    cacheSet(cacheKey, articles);
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

// Danger: clear all news and trigger a fresh scrape
app.post('/api/news/reset', async (req, res) => {
  try {
    const deleted = await db.deleteAllArticles();
    // Notify clients to clear immediately
    try {
      io.emit('articles-cleared');
      io.emit('articles-sync', { articles: [] });
    } catch {}
    // Immediately start a new collection but don't block response
    setImmediate(async () => {
      try { await scheduler.runOnce({ force: true }); } catch (e) { console.error('runOnce failed after reset:', e.message); }
    });
    res.json({ success: true, deleted, message: 'All news deleted; new collection triggered' });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
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

// Persisted system metrics history (up to last 2 hours)
app.get('/api/system-metrics/history', async (req, res) => {
  try {
    const sinceMs = parseInt(req.query.sinceMs) || (Date.now() - 2 * 60 * 60 * 1000);
    const Database = require('./database');
    const dbh = new Database();
    const rows = await dbh.getSystemMetricsSince(sinceMs);
    dbh.close();
    res.json({ samples: rows });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Stream live debug events over WebSocket and expose rolling logs over HTTP
app.get('/api/debug/logs', (req, res) => {
  try {
    const { level, limit = 200, event } = req.query || {};
    const logs = realTimeMonitor.getLogs(level, parseInt(limit), event);
    res.json({ logs });
  } catch (e) {
    res.status(500).json({ error: e.message });
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

// Scraping configuration endpoints
app.get('/api/scraping/methods', (req, res) => {
  try {
    const methods = scrapingService.getAvailableMethods();
    const currentMethod = scrapingService.getScrapingMethod();
    const stats = scrapingService.getStats();
    
    res.json({
      currentMethod,
      availableMethods: methods,
      stats
    });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

app.post('/api/scraping/method', async (req, res) => {
  try {
    const { method } = req.body;
    
    if (!method) {
      return res.status(400).json({ error: 'Method is required' });
    }
    
    const success = scrapingService.setScrapingMethod(method);
    
    if (!success) {
      return res.status(400).json({ 
        error: 'Invalid scraping method',
        availableMethods: scrapingService.getAvailableMethods().map(m => m.name)
      });
    }
    
    // Save to database
    await db.setSetting('scraping_method', method);
    
    // Trigger immediate news collection with new method
    console.log(`📰 Triggering immediate news collection with ${scrapingService.getDisplayName(method)}`);
    
    // Get the news scheduler instance and trigger collection
    if (global.newsScheduler && global.newsScheduler.aiService) {
      // Don't await - let it run in background
      global.newsScheduler.collectAndAnalyzeNews().catch(error => {
        console.error('Error in triggered news collection:', error);
      });
    }

    res.json({
      success: true,
      currentMethod: method,
      message: `Scraping method changed to ${scrapingService.getDisplayName(method)}. Collecting news with new method...`
    });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

app.post('/api/scraping/test', async (req, res) => {
  try {
    const { method, feeds } = req.body;
    
    if (!method) {
      return res.status(400).json({ error: 'Method is required' });
    }
    
    // Different test feeds for each method to show real performance differences
    const methodFeeds = {
      'feedparser': [
        'https://feeds.feedburner.com/zerohedge/feed',
        'https://seekingalpha.com/feed.xml'
      ],
      'cheerio': [
        'https://cointelegraph.com/rss',
        'https://www.marketwatch.com/rss/topstories',
        'https://feeds.feedburner.com/TheMotleyFool'
      ],
      'puppeteer': [
        'https://feeds.reuters.com/reuters/topNews',
        'https://rss.cnn.com/rss/edition.rss'
      ],
      'scrapy': [
        'https://feeds.bbci.co.uk/news/business/rss.xml',
        'https://www.ft.com/rss/home/us',
        'https://feeds.feedburner.com/time/topstories'
      ],
      'beautifulsoup': [
        'https://feeds.washingtonpost.com/rss/business',
        'https://feeds.npr.org/1001/rss.xml'
      ]
    };
    
    const testFeeds = feeds || methodFeeds[method] || methodFeeds['feedparser'];
    
    // Temporarily change method for testing
    const originalMethod = scrapingService.getScrapingMethod();
    scrapingService.setScrapingMethod(method);
    
    const startTime = Date.now();
    const articles = await scrapingService.scrapeRSSFeeds(testFeeds);
    const duration = Date.now() - startTime;
    
    // Restore original method
    scrapingService.setScrapingMethod(originalMethod);
    
    res.json({
      success: true,
      method,
      articles: articles.slice(0, 5), // Return only first 5 for testing
      totalArticles: articles.length,
      duration,
      testFeeds
    });
  } catch (error) {
    res.status(500).json({ 
      error: error.message,
      method: req.body.method
    });
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

// Scraping libraries: test and info
app.get('/api/scraping/libs', async (req, res) => {
  try {
    const activeLib = (await db.getSetting('active_scraping_lib')) || 'scrapy';
    const scrappingInterval = parseInt(await db.getSetting('scrapping_interval_sec')) || 30;
    const libs = [
      { key: 'scrapy', name: 'Python Scrapy', intervalSec: scrappingInterval, active: activeLib === 'scrapy' },
      { key: 'selenium', name: 'Selenium (Chromium)', intervalSec: null, active: activeLib === 'selenium' },
      { key: 'bs4', name: 'Requests + BeautifulSoup', intervalSec: null, active: activeLib === 'bs4' },
      { key: 'playwright', name: 'Playwright (Chromium)', intervalSec: null, active: activeLib === 'playwright' },
      { key: 'feedparser', name: 'Feedparser (RSS/Atom)', intervalSec: null, active: activeLib === 'feedparser' },
      { key: 'feedsearch', name: 'Feedsearch (discover feeds)', intervalSec: null, active: activeLib === 'feedsearch' },
      { key: 'pygooglenews', name: 'PyGoogleNews (Google News RSS)', intervalSec: null, active: activeLib === 'pygooglenews' },
      { key: 'newscatcher', name: 'NewsCatcher', intervalSec: null, active: activeLib === 'newscatcher' },
      { key: 'newspaper3k', name: 'Newspaper3k (article extract)', intervalSec: null, active: activeLib === 'newspaper3k' },
      { key: 'trafilatura', name: 'Trafilatura', intervalSec: null, active: activeLib === 'trafilatura' },
      { key: 'investpy', name: 'Investpy (economic calendar)', intervalSec: null, active: activeLib === 'investpy' }
    ];
    res.json({ libs });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

app.post('/api/scraping/test', async (req, res) => {
  try {
    const key = (req.body && req.body.key) || 'scrapy';
    const start = Date.now();
    let articles = 0;
    let library = key;
    // Build source lists (mirror /api/scraping/sources)
    const buildSources = async () => {
      const aiServiceFeeds = [
        'https://feeds.feedburner.com/zerohedge/feed',
        'https://seekingalpha.com/feed.xml',
        'https://feeds.feedburner.com/TheMotleyFool',
        'https://www.investing.com/rss/news.rss',
        'https://www.marketwatch.com/feeds/topstories',
        'https://news.google.com/rss/topics/CAAqJggKIiBDQkFTRWdvSUwyMHZNRGx1YlY4U0FtVnVHZ0pWVXlnQVAB?hl=en-US&gl=US&ceid=US:en',
        'https://www.ft.com/rss/home/us',
        'https://www.bloomberg.com/feeds/podcast/etf_report.xml',
        'https://www.reutersagency.com/feed/?best-topics=business-finance&post_type=best',
        'https://www.nasdaq.com/feed/rssoutbound?category=US%20Markets',
        'https://feeds.finance.yahoo.com/rss/2.0/headline',
        // Additional general business/markets
        'https://www.cnbc.com/id/10000664/device/rss/rss.html',
        'https://www.cnbc.com/id/100003114/device/rss/rss.html',
        'https://www.zacks.com/stock/research/feed',
        'https://www.fool.com/a/feeds/foolwatch.xml',
        'https://www.coindesk.com/arc/outboundfeeds/rss/',
        'https://cointelegraph.com/rss',
        'https://decrypt.co/feed',
        'https://www.theblock.co/rss',
        'https://www.dailyfx.com/feeds/market-news',
        'https://www.fxstreet.com/rss',
        'https://www.oilprice.com/rss/main.xml',
        'https://www.kitco.com/rss/feed.xml',
        'https://www.wsj.com/xml/rss/3_7031.xml',
        'https://www.economist.com/finance-and-economics/rss.xml',
        'https://www.semianalysis.com/feed',
        'https://www.techmeme.com/feed.xml',
        // Macro/policy institutions
        'https://www.federalreserve.gov/feeds/press_all.xml',
        'https://www.ecb.europa.eu/press/pressconf/html/index.en.rss',
        'https://www.imf.org/external/np/speeches/rss.aspx',
        'https://home.treasury.gov/news/press-releases/rss',
        'https://www.bis.org/pressreleases_rss.xml',
        'https://www.bea.gov/news/rss.xml',
        'https://www.bls.gov/feeds/news_release.rss',
        // ETFs / funds
        'https://www.etftrends.com/feed/'
      ];
      const scrapyFeeds = [
        'https://feeds.finance.yahoo.com/rss/2.0/headline',
        'https://www.marketwatch.com/rss/topstories',
        'https://news.google.com/rss/topics/CAAqJggKIiBDQkFTRWdvSUwyMHZNRGx1YlY4U0FtVnVHZ0pWVXlnQVAB?hl=en-US&gl=US&ceid=US:en',
        'https://www.cnbc.com/id/100003114/device/rss/rss.html',
        'https://www.reuters.com/business/finance/rss',
        'https://www.ft.com/rss/home',
        'https://www.bloomberg.com/politics/feeds/site.xml',
        'https://www.investing.com/rss/news.rss',
        'https://seekingalpha.com/market_currents.xml',
        'https://www.zerohedge.com/fullrss2.xml',
        'https://feeds.feedburner.com/TheMotleyFool',
        // Extra solid RSS endpoints for Scrapy
        'https://www.wsj.com/xml/rss/3_7031.xml',
        'https://www.fxstreet.com/rss',
        'https://www.coindesk.com/arc/outboundfeeds/rss/',
        'https://cointelegraph.com/rss',
        'https://decrypt.co/feed',
        'https://www.oilprice.com/rss/main.xml',
        'https://www.kitco.com/rss/feed.xml'
      ];
      let extra = [];
      try { const raw = await db.getSetting('rss_sources_extra'); if (raw) extra = JSON.parse(raw); } catch {}
      // Apply blacklist so tests reflect the same set as the UI list
      let blacklist = [];
      try { const rawBl = await db.getSetting('rss_sources_blacklist'); if (rawBl) blacklist = JSON.parse(rawBl); } catch {}
      const isAllowed = (u) => !blacklist.includes(u);
      const mergeUnique = (arr1, arr2) => Array.from(new Set([...(arr1||[]), ...(arr2||[])]));
      return {
        ai: mergeUnique(aiServiceFeeds, extra).filter(isAllowed),
        scrapy: mergeUnique(scrapyFeeds, extra).filter(isAllowed)
      };
    };
    const probeSources = async (urls) => {
      const axios = require('axios');
      const baseHeaders = {
        'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
        'Accept': 'application/rss+xml,application/xml;q=0.9,text/html;q=0.8,*/*;q=0.7',
        'Accept-Language': 'en-US,en;q=0.9',
        'Accept-Encoding': 'gzip, deflate',
        'Referer': 'https://www.google.com/',
        'Connection': 'keep-alive'
      };
      const tests = urls.map(async (u) => {
        const t0 = Date.now();
        try {
          const r = await axios.get(u, { timeout: 7000, maxRedirects: 3, validateStatus: ()=>true, headers: baseHeaders });
          const ok = r.status >= 200 && r.status < 400;
          return {
            url: u,
            ok,
            status: r.status,
            headers: r.headers && typeof r.headers === 'object' ? { 'content-type': r.headers['content-type'] } : undefined,
            durationMs: Date.now()-t0
          };
        } catch (e) {
          // Chromium fallback
          try {
            const cr = await browserPool.fetch(u);
            return { url: u, ok: cr.ok, status: cr.status, fixed_by: 'chromium', durationMs: Date.now()-t0 };
          } catch {}
          return {
            url: u,
            ok: false,
            error: e.code || e.message,
            status: e.response && e.response.status,
            reason: e.name,
            message: e.message,
            stack: e.stack,
            durationMs: Date.now()-t0
          };
        }
      });
      return Promise.all(tests);
    };

    // Helpers for specific libraries
    const parseWithFeedparser = async (urls) => {
      const axios = require('axios');
      const results = [];
      for (const url of urls) {
        const t0 = Date.now();
        try {
          const resp = await axios.get(url, { responseType: 'stream', timeout: 10000, headers: { 'User-Agent': 'Mozilla/5.0', 'Accept': 'application/rss+xml,application/xml;q=0.9,*/*;q=0.8' } });
          const fp = new FeedParser();
          const items = [];
          await new Promise((resolve, reject) => {
            resp.data.pipe(fp);
            fp.on('error', reject);
            fp.on('readable', function() { let item; while (item = this.read()) { items.push(item); if (items.length >= 50) break; } });
            fp.on('end', resolve);
          });
          results.push({ url, ok: items.length > 0, status: 200, durationMs: Date.now()-t0, items: items.length });
        } catch (e) {
          results.push({ url, ok: false, error: e.message, durationMs: Date.now()-t0 });
        }
      }
      return results;
    };

    const discoverFeeds = async (roots) => {
      const axios = require('axios');
      const cheerio = require('cheerio');
      const results = [];
      for (const root of roots) {
        const t0 = Date.now();
        try {
          const resp = await axios.get(root, { timeout: 10000, headers: { 'User-Agent': 'Mozilla/5.0' } });
          const $ = cheerio.load(resp.data);
          const links = new Set();
          $('link').each((_, el) => {
            const type = ($(el).attr('type')||'').toLowerCase();
            const href = $(el).attr('href');
            if ((type.includes('rss') || type.includes('xml') || /rss|feed|xml/i.test(href||'')) && href) {
              try { links.add(new URL(href, root).toString()); } catch {}
            }
          });
          $('a[href]').each((_, el) => {
            const href = $(el).attr('href');
            if (/rss|feed|xml/i.test(href||'')) { try { links.add(new URL(href, root).toString()); } catch {} }
          });
          results.push({ url: root, ok: links.size > 0, status: 200, durationMs: Date.now()-t0, discovered: Array.from(links).slice(0, 10) });
        } catch (e) {
          results.push({ url: root, ok: false, error: e.message, durationMs: Date.now()-t0 });
        }
      }
      return results;
    };

    // Determine which sources to probe
    const { ai, scrapy } = await buildSources();
    const selected = key === 'scrapy' ? scrapy : ai;
    let bySource = [];
    if (key === 'selenium') {
      // Use enhanced Selenium collector to process ALL selected sources and count ALL items
      const { spawn } = require('child_process');
      const py = spawn('/app/scrapy_news_collector/venv/bin/python3', ['-u', '/app/scrapy_news_collector/selenium_collector.py'], {
        env: { ...process.env, SELENIUM_SOURCES_JSON: JSON.stringify(selected), CHR_NAV_TIMEOUT_MS: String(parseInt(process.env.CHR_NAV_TIMEOUT_MS || '12000')) }
      });
      let out = '';
      let err = '';
      const done = new Promise((resolve) => {
        py.stdout.on('data', (d) => { out += d.toString(); });
        py.stderr.on('data', (d) => { err += d.toString(); });
        py.on('close', () => resolve());
      });
      // Safety timeout (40s for full sweep)
      await Promise.race([
        done,
        new Promise((resolve) => setTimeout(() => { try { py.kill('SIGTERM'); } catch {} resolve(); }, 40000))
      ]);
      try {
        const parsed = JSON.parse(out || '{}');
        const results = Array.isArray(parsed.results) ? parsed.results : [];
        bySource = results.map(r => ({ url: r.source, ok: !!r.ok, status: r.ok ? 200 : 0, durationMs: r.durationMs, error: r.error, items: Array.isArray(r.items) ? r.items.length : 0 }));
        // Aggregate total items as articles
        articles = results.reduce((sum, r) => sum + (Array.isArray(r.items) ? r.items.length : 0), 0);
      } catch {
        bySource = [];
      }
    } else if (key === 'feedparser') {
      bySource = await parseWithFeedparser(selected.slice(0, 12));
      articles = bySource.filter(s=>s.ok).reduce((sum, s)=> sum + (s.items||0), 0);
    } else if (key === 'feedsearch') {
      const roots = ['https://finance.yahoo.com','https://www.marketwatch.com','https://www.reuters.com','https://www.ft.com'];
      bySource = await discoverFeeds(roots);
      // Count discovered feeds as articles estimation
      articles = bySource.reduce((sum, r)=> sum + ((r.discovered||[]).length), 0);
    } else if (key === 'pygooglenews') {
      const queries = [
        'stock market', 'forex', 'crypto', 'commodities',
      ];
      const urls = queries.map(q => `https://news.google.com/rss/search?q=${encodeURIComponent(q)}&hl=en-US&gl=US&ceid=US:en`);
      bySource = await parseWithFeedparser(urls);
      articles = bySource.filter(s=>s.ok).reduce((sum, s)=> sum + (s.items||0), 0);
    } else if (key === 'newscatcher') {
      // Placeholder without API key: use Google News Business as free alternative
      const urls = ['https://news.google.com/rss/headlines/section/topic/BUSINESS?hl=en-US&gl=US&ceid=US:en'];
      bySource = await parseWithFeedparser(urls);
      articles = bySource.filter(s=>s.ok).reduce((sum, s)=> sum + (s.items||0), 0);
    } else if (key === 'newspaper3k') {
      // Fetch first item from a few feeds and measure content length via Chromium (as proxy for extraction)
      const axios = require('axios');
      const feeds = selected.slice(0, 4);
      const tests = [];
      for (const f of feeds) {
        const t0 = Date.now();
        try {
          const parsed = await parseWithFeedparser([f]);
          const firstUrl = (parsed[0] && parsed[0].ok && parsed[0].items) ? null : null;
          let articleUrl = null;
          try {
            const resp = await axios.get(f, { timeout: 8000 });
            const m = String(resp.data).match(/<link>(.*?)<\/link>/i);
            if (m && m[1]) articleUrl = m[1];
          } catch {}
          if (!articleUrl) { tests.push({ url: f, ok: false, error: 'no-article', durationMs: Date.now()-t0 }); continue; }
          const cr = await browserPool.fetch(articleUrl);
          tests.push({ url: articleUrl, ok: !!cr.ok, status: cr.status, durationMs: Date.now()-t0 });
        } catch (e) {
          tests.push({ url: f, ok: false, error: e.message, durationMs: Date.now()-t0 });
        }
      }
      bySource = tests;
      articles = bySource.filter(s=>s.ok).length;
    } else if (key === 'bs4') {
      // Basic HTML fetch + cheerio parse title
      const axios = require('axios');
      const cheerio = require('cheerio');
      const roots = selected.slice(0, 8).map(u=> new URL(u).origin);
      bySource = await Promise.all(roots.map(async (u)=>{
        const t0 = Date.now();
        try { const r = await axios.get(u, { timeout: 8000, headers: { 'User-Agent': 'Mozilla/5.0' }}); const $ = cheerio.load(r.data); const title = $('title').text().trim(); return { url: u, ok: !!title, status: r.status, durationMs: Date.now()-t0 } } catch(e) { return { url: u, ok:false, error:e.message, durationMs: Date.now()-t0 }; }
      }));
      articles = bySource.filter(s=>s.ok).length;
    } else if (key === 'investpy') {
      // Not enabled in this image: return informative status
      bySource = [{ url: 'economic_calendar', ok: false, error: 'Investpy not available in current build', status: 0, durationMs: 1 }];
      articles = 0;
    } else if (key === 'playwright') {
      // Use Node Chromium fetch as Playwright proxy
      bySource = await Promise.all(selected.slice(0, 6).map(async (u)=>{
        const t0 = Date.now();
        try { const r = await browserPool.fetch(u); return { url: u, ok: r.ok, status: r.status, durationMs: Date.now()-t0 } } catch(e){ return { url: u, ok:false, error:e.message, durationMs: Date.now()-t0 }; }
      }));
      articles = bySource.filter(s=>s.ok).length;
    } else {
      bySource = await probeSources(selected);
    }
    try {
      if (key === 'scrapy') {
        // Kick off a real scrape in background so UI is responsive
        setImmediate(async () => {
          try { await scheduler.scrapyService.runScraper(); } catch (e) { console.error('scrapy test background run failed:', e.message); }
        });
        // Quick estimate based on reachable sources
        articles = bySource.filter(s=>s.ok).length;
      } else if (key !== 'selenium') {
        // Simulated aggregate based on successful probes (non-selenium)
        articles = bySource.filter(s=>s.ok).length;
      }
    } catch (e) { /* ignore, response will still include bySource */ }
    const durationMs = Date.now() - start;
    res.json({ success: true, library, articles, durationMs, bySource });
  } catch (e) {
    res.status(500).json({ success: false, error: e.message });
  }
});

// Experimental: Trigger Selenium-based browse of sources to extract feeds and page content hints
app.post('/api/scraping/selenium/browse', async (req, res) => {
  try {
    const { urls, timeoutMs } = req.body || {};
    if (!Array.isArray(urls) || urls.length === 0) {
      return res.status(400).json({ success: false, error: 'urls[] required' });
    }
    const py = spawn('/app/scrapy_news_collector/venv/bin/python', ['-u', '/app/scrapy_news_collector/selenium_fetcher.py'], {
      env: { ...process.env, SELENIUM_SOURCES_JSON: JSON.stringify(urls), CHR_NAV_TIMEOUT_MS: String(timeoutMs || 12000) }
    });
    let out = '';
    let err = '';
    py.stdout.on('data', (d) => { out += d.toString(); });
    py.stderr.on('data', (d) => { err += d.toString(); });
    py.on('close', (code) => {
      try {
        const parsed = JSON.parse(out || '{}');
        return res.json({ success: true, code, ...parsed, stderr: err.trim() || undefined });
      } catch (e) {
        return res.json({ success: false, error: e.message, raw: out, stderr: err.trim() || undefined });
      }
    });
  } catch (e) {
    res.status(500).json({ success: false, error: e.message });
  }
});

// Streaming per-source test results via Server-Sent Events (SSE)
app.get('/api/scraping/test/stream', async (req, res) => {
  try {
    const key = (req.query && req.query.key) || 'scrapy';
    res.setHeader('Content-Type', 'text/event-stream');
    res.setHeader('Cache-Control', 'no-cache');
    res.setHeader('Connection', 'keep-alive');
    res.flushHeaders && res.flushHeaders();

    const axios = require('axios');
    const baseHeaders = {
      'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
      'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,application/rss+xml;q=0.9,*/*;q=0.8',
      'Accept-Language': 'en-US,en;q=0.9',
      'Accept-Encoding': 'gzip, deflate, br',
      'Referer': 'https://www.google.com/',
      'Connection': 'keep-alive'
    };
    // Build sources (duplicated logic kept local for isolation)
    const aiServiceFeeds = [
      'https://feeds.feedburner.com/zerohedge/feed',
      'https://seekingalpha.com/feed.xml',
      'https://feeds.feedburner.com/TheMotleyFool',
      'https://www.investing.com/rss/news.rss',
      'https://news.google.com/rss/topics/CAAqJggKIiBDQkFTRWdvSUwyMHZNRGx1YlY4U0FtVnVHZ0pWVXlnQVAB?hl=en-US&gl=US&ceid=US:en',
      'https://www.marketwatch.com/feeds/topstories',
      'https://www.ft.com/rss/home/us',
      'https://www.bloomberg.com/feeds/podcast/etf_report.xml',
      'https://www.reutersagency.com/feed/?best-topics=business-finance&post_type=best',
      'https://www.nasdaq.com/feed/rssoutbound?category=US%20Markets',
      'https://feeds.finance.yahoo.com/rss/2.0/headline',
      'https://www.zacks.com/stock/research/feed',
      'https://www.fool.com/a/feeds/foolwatch.xml',
      'https://www.coindesk.com/arc/outboundfeeds/rss/',
      'https://cointelegraph.com/rss',
      'https://www.theblock.co/rss',
      'https://www.dailyfx.com/feeds/market-news',
      'https://www.fxstreet.com/rss',
      'https://www.oilprice.com/rss/main.xml',
      'https://www.kitco.com/rss/feed.xml',
      'https://www.wsj.com/xml/rss/3_7031.xml',
      'https://www.economist.com/finance-and-economics/rss.xml',
      'https://www.semianalysis.com/feed',
      'https://www.techmeme.com/feed.xml'
    ];
    const scrapyFeeds = [
      'https://feeds.finance.yahoo.com/rss/2.0/headline',
      'https://www.marketwatch.com/rss/topstories',
      'https://news.google.com/rss/topics/CAAqJggKIiBDQkFTRWdvSUwyMHZNRGx1YlY4U0FtVnVHZ0pWVXlnQVAB?hl=en-US&gl=US&ceid=US:en',
      'https://www.cnbc.com/id/100003114/device/rss/rss.html',
      'https://www.reuters.com/business/finance/rss',
      'https://www.ft.com/rss/home',
      'https://www.bloomberg.com/politics/feeds/site.xml',
      'https://www.investing.com/rss/news.rss',
      'https://seekingalpha.com/market_currents.xml',
      'https://www.zerohedge.com/fullrss2.xml',
      'https://feeds.feedburner.com/TheMotleyFool'
    ];
    let extra = [];
    try { const raw = await db.getSetting('rss_sources_extra'); if (raw) extra = JSON.parse(raw); } catch {}
    // Apply blacklist so streaming test matches the UI list
    let blacklist = [];
    try { const rawBl = await db.getSetting('rss_sources_blacklist'); if (rawBl) blacklist = JSON.parse(rawBl); } catch {}
    const isAllowed = (u) => !blacklist.includes(u);
    const mergeUnique = (arr1, arr2) => Array.from(new Set([...(arr1||[]), ...(arr2||[])]));
    const selected = (key === 'scrapy' ? mergeUnique(scrapyFeeds, extra) : mergeUnique(aiServiceFeeds, extra)).filter(isAllowed);

    // Clear signal to client
    res.write(`event: clear\n`);
    res.write(`data: {"ok":0,"fail":0}\n\n`);

    let ok = 0; let fail = 0; const start = Date.now();
    const controller = new AbortController();
    req.on('close', () => { try { controller.abort(); } catch {} });

    for (const u of selected) {
      const t0 = Date.now();
      try {
        const r = await axios.get(u, { timeout: 7000, maxRedirects: 3, validateStatus: ()=>true, headers: baseHeaders, httpAgent: undefined, httpsAgent: undefined });
        const sample = { url: u, ok: r.status >= 200 && r.status < 400, status: r.status, durationMs: Date.now() - t0 };
        if (sample.ok) ok++; else fail++;
        res.write(`data: ${JSON.stringify(sample)}\n\n`);
      } catch (e) {
        const sample = { url: u, ok: false, error: e.code || e.message, durationMs: Date.now() - t0 };
        fail++;
        res.write(`data: ${JSON.stringify(sample)}\n\n`);
      }
    }
    const durationMs = Date.now() - start;
    res.write(`event: done\n`);
    res.write(`data: ${JSON.stringify({ ok, fail, durationMs })}\n\n`);
    res.end();
  } catch (e) {
    try {
      res.write(`event: done\n`);
      res.write(`data: ${JSON.stringify({ ok:0, fail:0, error: e.message })}\n\n`);
    } catch {}
    try { res.end(); } catch {}
  }
});

// Select active scraping library
app.post('/api/scraping/use', async (req, res) => {
  try {
    const { key } = req.body || {};
    if (!key) return res.status(400).json({ success: false, error: 'key required' });
    await db.setSetting('active_scraping_lib', key);
    // Broadcast library change to all clients
    try { io.emit('scraper-lib-changed', { key, ts: Date.now() }); } catch {}
    // Trigger an immediate scrape with the newly selected library (non-blocking)
    setImmediate(async () => {
      try { await scheduler.runOnce({ force: true }); } catch (e) { console.error('runOnce failed after lib switch:', e.message); }
    });
    res.json({ success: true, key, triggered: true });
  } catch (e) {
    res.status(500).json({ success: false, error: e.message });
  }
});

// Get/Set scrapping interval (seconds)
app.get('/api/scraping/config', async (req, res) => {
  try {
    const intervalSec = parseInt(await db.getSetting('scrapping_interval_sec')) || 30;
    // Advanced scraping options persisted in DB
    const seleniumEnabled = ((await db.getSetting('selenium_enabled')) || '0') === '1';
    let extraListingPages = [];
    try { const raw = await db.getSetting('extra_listing_pages'); if (raw) extraListingPages = JSON.parse(raw); } catch {}
    const maxPaginationPages = parseInt(await db.getSetting('max_pagination_pages')) || 10;
    const cfg = {
      intervalSec,
      seleniumEnabled,
      extraListingPages,
      maxPaginationPages,
      spiders: (process.env.SPIDERS || 'rss_news').split(',').map(s=>s.trim()).filter(Boolean),
      rssSchedules: { fast: '*/2 min', main: '*/5 min', macro: '*/20 min' },
      scrapy: {
        DOWNLOAD_DELAY: parseFloat(process.env.SCRAPY_DOWNLOAD_DELAY || '1.5'),
        CONCURRENT_REQUESTS: parseInt(process.env.SCRAPY_CONCURRENT_REQUESTS || '16'),
        CONCURRENT_REQUESTS_PER_DOMAIN: parseInt(process.env.SCRAPY_CONCURRENT_REQUESTS_PER_DOMAIN || '2'),
        AUTOTHROTTLE_ENABLED: (process.env.SCRAPY_AUTOTHROTTLE_ENABLED || 'true'),
        AUTOTHROTTLE_START_DELAY: parseFloat(process.env.SCRAPY_AUTOTHROTTLE_START_DELAY || '1.0'),
        AUTOTHROTTLE_MAX_DELAY: parseFloat(process.env.SCRAPY_AUTOTHROTTLE_MAX_DELAY || '15.0'),
        AUTOTHROTTLE_TARGET_CONCURRENCY: parseFloat(process.env.SCRAPY_AUTOTHROTTLE_TARGET_CONCURRENCY || '1.0'),
        DOWNLOAD_TIMEOUT: parseInt(process.env.SCRAPY_DOWNLOAD_TIMEOUT || '45'),
        RETRY_ENABLED: (process.env.SCRAPY_RETRY_ENABLED || 'true'),
        RETRY_TIMES: parseInt(process.env.SCRAPY_RETRY_TIMES || '3')
      }
    };
    res.json(cfg);
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

app.post('/api/scraping/config', async (req, res) => {
  try {
    const { intervalSec, scrapy, seleniumEnabled, extraListingPages, maxPaginationPages } = req.body || {};
    const value = parseInt(intervalSec);
    if (!Number.isFinite(value) || value <= 0) {
      return res.status(400).json({ success: false, error: 'intervalSec must be a positive integer' });
    }
    await db.setSetting('scrapping_interval_sec', String(value));
    // Persist Selenium + pagination settings
    if (typeof seleniumEnabled === 'boolean') {
      await db.setSetting('selenium_enabled', seleniumEnabled ? '1' : '0');
      process.env.SELENIUM_ENABLED = seleniumEnabled ? '1' : '0';
    }
    if (extraListingPages !== undefined) {
      try {
        const asArray = Array.isArray(extraListingPages) ? extraListingPages : JSON.parse(String(extraListingPages || '[]'));
        await db.setSetting('extra_listing_pages', JSON.stringify(asArray));
        process.env.EXTRA_LISTING_PAGES = JSON.stringify(asArray);
      } catch (e) {
        // ignore parse errors; don't overwrite existing on bad input
      }
    }
    if (maxPaginationPages !== undefined) {
      const mpp = parseInt(maxPaginationPages);
      if (Number.isFinite(mpp) && mpp > 0) {
        await db.setSetting('max_pagination_pages', String(mpp));
        process.env.MAX_PAGINATION_PAGES = String(mpp);
      }
    }
    // Apply Scrapy env overrides (runtime) if present
    if (scrapy && typeof scrapy === 'object') {
      const map = {
        DOWNLOAD_DELAY: 'SCRAPY_DOWNLOAD_DELAY',
        CONCURRENT_REQUESTS: 'SCRAPY_CONCURRENT_REQUESTS',
        CONCURRENT_REQUESTS_PER_DOMAIN: 'SCRAPY_CONCURRENT_REQUESTS_PER_DOMAIN',
        AUTOTHROTTLE_ENABLED: 'SCRAPY_AUTOTHROTTLE_ENABLED',
        AUTOTHROTTLE_START_DELAY: 'SCRAPY_AUTOTHROTTLE_START_DELAY',
        AUTOTHROTTLE_MAX_DELAY: 'SCRAPY_AUTOTHROTTLE_MAX_DELAY',
        AUTOTHROTTLE_TARGET_CONCURRENCY: 'SCRAPY_AUTOTHROTTLE_TARGET_CONCURRENCY',
        DOWNLOAD_TIMEOUT: 'SCRAPY_DOWNLOAD_TIMEOUT',
        RETRY_ENABLED: 'SCRAPY_RETRY_ENABLED',
        RETRY_TIMES: 'SCRAPY_RETRY_TIMES',
        RETRY_HTTP_CODES: 'SCRAPY_RETRY_HTTP_CODES'
      };
      Object.keys(map).forEach(k => {
        if (scrapy[k] !== undefined && scrapy[k] !== null && scrapy[k] !== '') {
          process.env[map[k]] = String(scrapy[k]);
        }
      });
    }
    res.json({ success: true, intervalSec: value, seleniumEnabled: ((await db.getSetting('selenium_enabled')) || '0') === '1', extraListingPages: (JSON.parse((await db.getSetting('extra_listing_pages')) || '[]')), maxPaginationPages: parseInt(await db.getSetting('max_pagination_pages')) || 10, scrapy: {
      DOWNLOAD_DELAY: process.env.SCRAPY_DOWNLOAD_DELAY,
      CONCURRENT_REQUESTS: process.env.SCRAPY_CONCURRENT_REQUESTS,
      CONCURRENT_REQUESTS_PER_DOMAIN: process.env.SCRAPY_CONCURRENT_REQUESTS_PER_DOMAIN,
      AUTOTHROTTLE_ENABLED: process.env.SCRAPY_AUTOTHROTTLE_ENABLED,
      AUTOTHROTTLE_START_DELAY: process.env.SCRAPY_AUTOTHROTTLE_START_DELAY,
      AUTOTHROTTLE_MAX_DELAY: process.env.SCRAPY_AUTOTHROTTLE_MAX_DELAY,
      AUTOTHROTTLE_TARGET_CONCURRENCY: process.env.SCRAPY_AUTOTHROTTLE_TARGET_CONCURRENCY,
      DOWNLOAD_TIMEOUT: process.env.SCRAPY_DOWNLOAD_TIMEOUT,
      RETRY_ENABLED: process.env.SCRAPY_RETRY_ENABLED,
      RETRY_TIMES: process.env.SCRAPY_RETRY_TIMES,
      RETRY_HTTP_CODES: process.env.SCRAPY_RETRY_HTTP_CODES
    }});
  } catch (e) {
    res.status(500).json({ success: false, error: e.message });
  }
});

// Get/Set enabled spiders (persisted in DB)
app.get('/api/scraping/spiders', async (req, res) => {
  try {
    let enabled = [];
    try { const raw = await db.getSetting('enabled_spiders'); if (raw) enabled = JSON.parse(raw); } catch {}
    const all = ['rss_news', 'html_news'];
    res.json({ enabled: Array.isArray(enabled) && enabled.length ? enabled : ['rss_news'], all });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

app.post('/api/scraping/spiders', async (req, res) => {
  try {
    const { enabled } = req.body || {};
    if (!Array.isArray(enabled)) {
      return res.status(400).json({ success: false, error: 'enabled[] required' });
    }
    const allowed = new Set(['rss_news', 'html_news']);
    const filtered = Array.from(new Set(enabled.filter((s)=>allowed.has(String(s)))));
    // Persist to DB and hint runtime via env
    await db.setSetting('enabled_spiders', JSON.stringify(filtered));
    process.env.SPIDERS = filtered.join(',');
    // Broadcast optional event to clients
    try { io.emit('spiders-changed', { enabled: filtered, ts: Date.now() }); } catch {}
    res.json({ success: true, enabled: filtered });
  } catch (e) {
    res.status(500).json({ success: false, error: e.message });
  }
});

// List all scraping sources (RSS) used across services
app.get('/api/scraping/sources', async (req, res) => {
  try {
    // Feeds used by the Node AI service
    const aiServiceFeeds = [
      'https://feeds.feedburner.com/zerohedge/feed',
      'https://seekingalpha.com/feed.xml',
      'https://feeds.feedburner.com/TheMotleyFool',
      'https://www.investing.com/rss/news.rss',
      'https://news.google.com/rss/topics/CAAqJggKIiBDQkFTRWdvSUwyMHZNRGx1YlY4U0FtVnVHZ0pWVXlnQVAB?hl=en-US&gl=US&ceid=US:en',
      'https://www.marketwatch.com/feeds/topstories',
      'https://www.ft.com/rss/home/us',
      'https://www.bloomberg.com/feeds/podcast/etf_report.xml',
      'https://www.reutersagency.com/feed/?best-topics=business-finance&post_type=best',
      'https://www.nasdaq.com/feed/rssoutbound?category=US%20Markets',
      'https://feeds.finance.yahoo.com/rss/2.0/headline',
      'https://www.zacks.com/stock/research/feed',
      'https://www.fool.com/a/feeds/foolwatch.xml',
      'https://www.coindesk.com/arc/outboundfeeds/rss/',
      'https://cointelegraph.com/rss',
      'https://www.theblock.co/rss',
      'https://www.dailyfx.com/feeds/market-news',
      'https://www.fxstreet.com/rss',
      'https://www.oilprice.com/rss/main.xml',
      'https://www.kitco.com/rss/feed.xml',
      'https://www.wsj.com/xml/rss/3_7031.xml',
      'https://www.economist.com/finance-and-economics/rss.xml',
      'https://www.semianalysis.com/feed',
      'https://www.techmeme.com/feed.xml'
    ];

    // Feeds used by the Python Scrapy spider
    const scrapyFeeds = [
      'https://feeds.finance.yahoo.com/rss/2.0/headline',
      'https://www.marketwatch.com/rss/topstories',
      'https://news.google.com/rss/topics/CAAqJggKIiBDQkFTRWdvSUwyMHZNRGx1YlY4U0FtVnVHZ0pWVXlnQVAB?hl=en-US&gl=US&ceid=US:en',
      'https://www.cnbc.com/id/100003114/device/rss/rss.html',
      'https://www.reuters.com/business/finance/rss',
      'https://www.ft.com/rss/home',
      'https://www.bloomberg.com/politics/feeds/site.xml',
      'https://www.investing.com/rss/news.rss',
      'https://seekingalpha.com/market_currents.xml',
      'https://www.zerohedge.com/fullrss2.xml',
      'https://feeds.feedburner.com/TheMotleyFool'
    ];

    // Merge in any saved extra feeds
    let extra = [];
    try {
      const raw = await db.getSetting('rss_sources_extra');
      if (raw) extra = JSON.parse(raw);
    } catch {}
    // Apply blacklist
    let blacklist = [];
    try { const raw = await db.getSetting('rss_sources_blacklist'); if (raw) blacklist = JSON.parse(raw); } catch {}
    const isAllowed = (u) => !blacklist.includes(u);
    const mergeUnique = (arr1, arr2) => Array.from(new Set([...(arr1||[]), ...(arr2||[])]));
    const aiMerged = mergeUnique(aiServiceFeeds, extra).filter(isAllowed);
    const scrapyMerged = mergeUnique(scrapyFeeds, extra).filter(isAllowed);
    res.json({ aiServiceFeeds: aiMerged, scrapyFeeds: scrapyMerged });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// Expand sources automatically and persist to DB for future runs
app.post('/api/scraping/sources/expand', async (req, res) => {
  try {
    const axios = require('axios');
    const cheerio = require('cheerio');

    // Curated starter set
    const curated = [
      // Extra crypto/forex/commodities
      'https://www.coinspeaker.com/rss/',
      'https://news.bitcoin.com/feed/',
      'https://cryptonews.com/news/feed',
      'https://www.forexlive.com/feed/',
      'https://www.oanda.com/forex-trading/analysis/market-analysis/rss',
      'https://www.spglobal.com/platts/en/rss',
      // Macro/indices
      'https://www.imf.org/external/np/speeches/rss.aspx',
      'https://www.ecb.europa.eu/press/pressconf/html/index.en.rss',
      'https://www.federalreserve.gov/feeds/press_all.xml',
      // Tech impacting markets
      'https://arstechnica.com/feed/',
      'https://www.theverge.com/rss/index.xml'
    ];

    // Seeds (home pages) to discover additional RSS links
    const seeds = [
      'https://finance.yahoo.com',
      'https://www.marketwatch.com',
      'https://www.nasdaq.com',
      'https://www.fxstreet.com',
      'https://www.dailyfx.com',
      'https://www.coindesk.com',
      'https://cointelegraph.com',
      'https://www.oilprice.com',
      'https://www.kitco.com',
      'https://www.reuters.com/finance',
      'https://www.wsj.com',
      'https://www.economist.com'
    ];

    const discovered = new Set(curated);
    const isRssLike = (href='') => /rss|feed|xml/i.test(href);
    const absolutize = (base, href) => {
      try { return new URL(href, base).toString(); } catch { return null; }
    };

    await Promise.all(seeds.map(async (seed) => {
      try {
        const resp = await axios.get(seed, { timeout: 10000, headers: { 'User-Agent': 'Mozilla/5.0 (NewsBot)' } });
        const $ = cheerio.load(resp.data);
        // <link rel="alternate" type="application/rss+xml" href="...">
        $('link').each((_, el) => {
          const type = ($(el).attr('type')||'').toLowerCase();
          const href = $(el).attr('href');
          if ((type.includes('rss') || type.includes('xml') || isRssLike(href)) && href) {
            const abs = absolutize(seed, href);
            if (abs) discovered.add(abs);
          }
        });
        $('a[href]').each((_, el) => {
          const href = $(el).attr('href');
          if (isRssLike(href)) {
            const abs = absolutize(seed, href);
            if (abs) discovered.add(abs);
          }
        });
      } catch (err) {
        console.warn('RSS discovery failed for', seed, err.message);
      }
    }));

    // Merge with existing stored
    let existing = [];
    try {
      const raw = await db.getSetting('rss_sources_extra');
      if (raw) existing = JSON.parse(raw);
    } catch {}

    const merged = Array.from(new Set([...(existing||[]), ...Array.from(discovered)]));
    await db.setSetting('rss_sources_extra', JSON.stringify(merged));
    return res.json({ success: true, added: merged.length - (existing||[]).length, total: merged.length });
  } catch (e) {
    res.status(500).json({ success: false, error: e.message });
  }
});

// Remove/bBlacklist problematic sources after a test run
app.post('/api/scraping/sources/purge-errors', async (req, res) => {
  try {
    const { urls } = req.body || {};
    if (!Array.isArray(urls) || urls.length === 0) {
      return res.status(400).json({ success: false, error: 'urls[] required' });
    }
    let blacklist = [];
    try { const raw = await db.getSetting('rss_sources_blacklist'); if (raw) blacklist = JSON.parse(raw); } catch {}
    const next = Array.from(new Set([...(blacklist||[]), ...urls]));
    await db.setSetting('rss_sources_blacklist', JSON.stringify(next));
    res.json({ success: true, blacklisted: next.length, added: next.length - (blacklist||[]).length });
  } catch (e) {
    res.status(500).json({ success: false, error: e.message });
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

// Get real-time system metrics
app.get('/api/monitoring/system', (req, res) => {
  res.json({
    system: realTimeMonitor.metrics.system,
    app: realTimeMonitor.metrics.app,
    history: {
      cpu: realTimeMonitor.performanceHistory.cpu.slice(-60), // Last 60 points
      memory: realTimeMonitor.performanceHistory.memory.slice(-60)
    }
  });
});

// Get system metrics from database
app.get('/api/monitoring/system/history', async (req, res) => {
  try {
    const hours = parseInt(req.query.hours) || 2;
    const metrics = await db.getSystemMetrics(hours);
    
    res.json({
      success: true,
      metrics: metrics,
      count: metrics.length,
      hours: hours
    });
  } catch (error) {
    console.error('Error fetching system metrics from database:', error);
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

// Get latest system metrics from database
app.get('/api/monitoring/system/latest', async (req, res) => {
  try {
    const latest = await db.getLatestSystemMetrics();
    
    res.json({
      success: true,
      metrics: latest
    });
  } catch (error) {
    console.error('Error fetching latest system metrics:', error);
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

// Debug endpoint to test Ollama analysis directly
app.post('/api/debug/ollama-analysis', async (req, res) => {
  try {
    const { title, content } = req.body;
    const OllamaService = require('./ollamaService');
    const ollama = new OllamaService();
    
    const testTitle = title || "Apple Reports Strong Q3 Earnings";
    const testContent = content || "Apple Inc. announced strong third-quarter earnings with revenue of $81.8 billion, beating analyst expectations. iPhone sales were particularly strong in emerging markets.";
    
    // Get current token limits
    const tokenLimitsStr = await db.getSetting('token_limits');
    const tokenLimits = tokenLimitsStr ? JSON.parse(tokenLimitsStr) : { analysis: 1200 };
    
    const result = await ollama.analyzeNewsWithOllama(
      'llama2-uncensored:latest',
      'Analyze this financial news article and provide a JSON response with summary, instrument_type, instrument_name, recommendation (BUY/SELL/HOLD), and confidence_score (1-100).',
      testTitle,
      testContent,
      'https://example.com',
      tokenLimits.analysis
    );
    
    res.json({
      success: true,
      input: { title: testTitle, content: testContent },
      tokenLimit: tokenLimits.analysis,
      result
    });
  } catch (error) {
    res.status(500).json({ error: error.message, stack: error.stack });
  }
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
      // Return 200 with structured error to avoid polluting error metrics
      return res.json({ success: false, error: 'Model name is required' });
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
      analysis: 1200,
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
    const chatTokensSetting = parseInt(await db.getSetting('ollama_chat_num_predict')) || parseInt(process.env.OLLAMA_CHAT_NUM_PREDICT || '64');
    
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
      return res.json({ success: false, error: 'Message is required' });
    }
    
    if (!socketId) {
      return res.json({ success: false, error: 'Socket ID is required for streaming' });
    }
    
    // Return immediately - streaming happens via WebSocket
    res.json({ success: true, message: 'Streaming started', socketId, timestamp: new Date().toISOString() });
    
    const startTime = Date.now();
    const chatTokensSetting = parseInt(await db.getSetting('ollama_chat_num_predict')) || parseInt(process.env.OLLAMA_CHAT_NUM_PREDICT || '64');
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
        console.log(`🎯 AI Chat Complete - Tokens: ${tokens}, Processing Time: ${processingTime}ms`);
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
    console.error('Error in streaming AI chat (will fallback to non-stream):', error.message);

    try {
      // Fallback to non-streaming chat so the UI still gets a response
      if (req.body.aiProvider === 'ollama') {
        const OllamaService = require('./ollamaService');
        const ollama = new OllamaService();
        const chatTokensSetting = parseInt(await db.getSetting('ollama_chat_num_predict')) || parseInt(process.env.OLLAMA_CHAT_NUM_PREDICT || '64');
        const result = await ollama.chatWithModel(req.body.model, req.body.message, req.body.customPrompt, { numPredict: chatTokensSetting });

        // Notify completion via websocket so UI can stop spinners
        if (req.body.socketId) {
          io.emit('ai-chat-complete', { 
            socketId: req.body.socketId, 
            processingTime: 0, 
            tokens: result.tokens || 0 
          });
          // Also push the full response as one final chunk
          io.emit('ai-chat-chunk', { socketId: req.body.socketId, chunk: result.response, timestamp: new Date().toISOString() });
        }

        // Update metrics
        realTimeMonitor.recordAIRequest('ollama', 0, result.tokens || 0);

        return res.json({ success: true, message: 'Fallback (non-stream) completed', tokens: result.tokens || 0 });
      }
    } catch (fallbackError) {
      console.error('Fallback chat also failed:', fallbackError.message);
      if (req.body.socketId) {
        io.emit('ai-chat-error', { socketId: req.body.socketId, error: fallbackError.message });
      }
      return res.json({ success: false, error: fallbackError.message });
    }
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
      const defaultTheme = require('./defaultTheme.json');
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
    const defaultTheme = require('./defaultTheme.json');
    
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
  console.log('🔄 Broadcasting systemMetrics to clients:', { 
    cpu: data.cpu?.usage, 
    memory: data.memory?.percentage,
    clientCount: io.engine.clientsCount 
  });
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

// Catch all handler for React app - MUST BE LAST!
app.get('*', (req, res) => {
  res.sendFile(path.join(__dirname, '../client/build', 'index.html'));
});

// Start server
server.listen(PORT, async () => {
  console.log(`Server running on port ${PORT}`);
  
  // Initialize scheduler
  await scheduler.init();
  
  // Initialize scraping service with saved method
  try {
    const savedMethod = await db.getSetting('scraping_method');
    if (savedMethod && scrapingService.getAvailableMethods().some(m => m.name === savedMethod)) {
      scrapingService.setScrapingMethod(savedMethod);
      console.log(`🔧 Restored scraping method: ${scrapingService.getDisplayName(savedMethod)}`);
    } else {
      console.log(`🔧 Using default scraping method: ${scrapingService.getDisplayName('feedparser')}`);
    }
  } catch (error) {
    console.warn('⚠️ Could not restore scraping method, using default:', error.message);
  }
  
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