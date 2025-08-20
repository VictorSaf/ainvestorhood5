const express = require('express');
const cors = require('cors');
const path = require('path');
const fs = require('fs');
const { createServer } = require('http');
const { Server } = require('socket.io');
require('dotenv').config();
const Database = require('./database');
const NewsScheduler = require('./newsScheduler');
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

// Serve static files from React build (only in production) with sensible cache headers
let latestMainJs = null;
let latestMainCss = null;
const buildDir = path.join(__dirname, '../client/build');
if (true) {
  try {
    const manifestPath = path.join(buildDir, 'asset-manifest.json');
    if (fs.existsSync(manifestPath)) {
      const manifest = JSON.parse(fs.readFileSync(manifestPath, 'utf8')) || {};
      latestMainJs = manifest.files?.['main.js'] || (manifest.entrypoints ? manifest.entrypoints.find((e)=>/main\..*\.js$/.test(e)) : null);
      latestMainCss = manifest.files?.['main.css'] || (manifest.entrypoints ? manifest.entrypoints.find((e)=>/main\..*\.css$/.test(e)) : null);
    }
  } catch {}

  app.use(express.static(buildDir, {
    setHeaders: (res, filePath) => {
      try {
        const rel = filePath.replace(buildDir, '');
        if (rel.endsWith('/index.html')) {
          res.setHeader('Cache-Control', 'no-cache, max-age=0, must-revalidate');
        } else if (/\.(js|css|png|jpg|jpeg|svg|gif|ico|woff2?)$/i.test(filePath)) {
          res.setHeader('Cache-Control', 'public, max-age=31536000, immutable');
        }
      } catch {}
    }
  }));

  // Redirect old hashed main bundle requests to the latest ones to avoid 404 after redeploy
  app.get(/^\/static\/js\/main\..*\.js$/, (req, res, next) => {
    if (latestMainJs && req.path !== latestMainJs) return res.redirect(302, latestMainJs);
    if (!latestMainJs) return res.status(204).end();
    next();
  });
  app.get(/^\/static\/css\/main\..*\.css$/, (req, res, next) => {
    if (latestMainCss && req.path !== latestMainCss) return res.redirect(302, latestMainCss);
    if (!latestMainCss) return res.status(204).end();
    next();
  });
}

// Prevent favicon 404 from polluting error metrics
app.get('/favicon.ico', (req, res) => res.status(204).end());

// API Routes
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

// Analyze one news article via platform AI (used by Scrapy and others)
app.post('/api/analyze', async (req, res) => {
  try {
    // Circuit breaker: refuse briefly after repeated failures
    if (Date.now() < analyzeCircuitOpenUntil) {
      return res.json({ success: true, analysis: {
        summary: 'Temporary fallback (circuit open)',
        instrument_type: 'stocks', instrument_name: null, recommendation: 'HOLD', confidence_score: 50
      }, fallback: 'circuit-open' });
    }

    // Concurrency guard
    if (analyzeActive >= ANALYZE_MAX_CONCURRENT) {
      return res.json({ success: true, analysis: {
        summary: 'Temporary fallback (congestion)',
        instrument_type: 'stocks', instrument_name: null, recommendation: 'HOLD', confidence_score: 50
      }, fallback: 'concurrency' });
    }
    analyzeActive++;
    const { title, content, url } = req.body || {};
    if (!title || !content) {
      // Treat invalid payload as graceful fallback to avoid polluting HTTP error metrics
      recordAnalyzeFailure();
      analyzeActive = Math.max(0, analyzeActive - 1);
      return res.json({ success: true, analysis: {
        summary: `Input incomplete. Proceeding with safe fallback for: ${String(title||'').substring(0,80)}...`,
        instrument_type: 'stocks', instrument_name: null, recommendation: 'HOLD', confidence_score: 50
      }, fallback: 'invalid-input' });
    }

    const makeFallback = () => ({
      summary: `Financial news analysis for: ${String(title).substring(0, 80)}...`,
      instrument_type: 'stocks',
      instrument_name: null,
      recommendation: 'HOLD',
      confidence_score: 50
    });

    // Graceful fallback when AI service is not configured
    if (!scheduler.aiService) {
      return res.json({ success: true, analysis: makeFallback(), fallback: 'no-ai-config' });
    }

    // Timeout guard to avoid long hangs
    const MAX_MS = 10000;
    const timed = new Promise((resolve, reject) => {
      const t = setTimeout(() => reject(new Error('analysis_timeout')), MAX_MS);
      scheduler.aiService.analyzeNewsArticle(title, content, url || '')
        .then((a) => { clearTimeout(t); resolve(a); })
        .catch((e) => { clearTimeout(t); reject(e); });
    });

    let analysis;
    try {
      analysis = await timed;
    } catch (e) {
      console.warn('Analyze fallback:', e.message);
      recordAnalyzeFailure();
      analysis = makeFallback();
    }

    analyzeActive = Math.max(0, analyzeActive - 1);
    return res.json({ success: true, analysis });
  } catch (error) {
    console.error('Error in /api/analyze:', error.message);
    recordAnalyzeFailure();
    analyzeActive = Math.max(0, analyzeActive - 1);
    // Absolute fallback path to keep HTTP 200 and not skew error metrics
    try {
      const { title } = req.body || {};
      const analysis = {
        summary: `Financial news analysis for: ${String(title||'').substring(0, 80)}...`,
        instrument_type: 'stocks',
        instrument_name: null,
        recommendation: 'HOLD',
        confidence_score: 50
      };
      return res.json({ success: true, analysis, fallback: 'exception' });
    } catch {
      return res.json({ success: true, analysis: { summary: 'N/A', instrument_type: 'stocks', instrument_name: null, recommendation: 'HOLD', confidence_score: 50 }, fallback: 'exception' });
    }
  }
});

// Resolve precise Yahoo Finance symbol for an instrument
app.post('/api/resolve-yahoo', async (req, res) => {
  try {
    const { instrument_type, instrument_name, title } = req.body || {};
    const symbol = await resolveYahooSymbol(instrument_type, instrument_name, title || '');
    res.json({ symbol });
  } catch (e) {
    res.status(500).json({ error: e.message });
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

// WebSocket metrics history (up to last 2 hours)
app.get('/api/websocket-metrics/history', async (req, res) => {
  try {
    const sinceMs = parseInt(req.query.sinceMs) || (Date.now() - 2 * 60 * 60 * 1000);
    const Database = require('./database');
    const dbh = new Database();
    const rows = await dbh.getWebsocketMetricsSince(sinceMs);
    dbh.close();
    res.json({ samples: rows });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// HTTP/DB/AI/Scrapy history for Overview
app.get('/api/http-metrics/history', async (req, res) => {
  try {
    const sinceMs = parseInt(req.query.sinceMs) || (Date.now() - 2 * 60 * 60 * 1000);
    const Database = require('./database');
    const dbh = new Database();
    const rows = await dbh.getHttpMetricsSince(sinceMs);
    dbh.close();
    res.json({ samples: rows });
  } catch (error) { res.status(500).json({ error: error.message }); }
});
app.get('/api/db-metrics/history', async (req, res) => {
  try {
    const sinceMs = parseInt(req.query.sinceMs) || (Date.now() - 2 * 60 * 60 * 1000);
    const Database = require('./database');
    const dbh = new Database();
    const rows = await dbh.getDbMetricsSince(sinceMs);
    dbh.close();
    res.json({ samples: rows });
  } catch (error) { res.status(500).json({ error: error.message }); }
});
app.get('/api/ai-metrics/history', async (req, res) => {
  try {
    const sinceMs = parseInt(req.query.sinceMs) || (Date.now() - 2 * 60 * 60 * 1000);
    const Database = require('./database');
    const dbh = new Database();
    const rows = await dbh.getAiMetricsSince(sinceMs);
    dbh.close();
    res.json({ samples: rows });
  } catch (error) { res.status(500).json({ error: error.message }); }
});
app.get('/api/scrapy-metrics/history', async (req, res) => {
  try {
    const sinceMs = parseInt(req.query.sinceMs) || (Date.now() - 2 * 60 * 60 * 1000);
    const Database = require('./database');
    const dbh = new Database();
    const rows = await dbh.getScrapyMetricsSince(sinceMs);
    dbh.close();
    res.json({ samples: rows });
  } catch (error) { res.status(500).json({ error: error.message }); }
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
      { key: 'bs4', name: 'BeautifulSoup + Requests', intervalSec: null, active: activeLib === 'bs4' },
      { key: 'playwright', name: 'Playwright (Python)', intervalSec: null, active: activeLib === 'playwright' },
      { key: 'trafilatura', name: 'Trafilatura', intervalSec: null, active: activeLib === 'trafilatura' }
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
      const mergeUnique = (arr1, arr2) => Array.from(new Set([...(arr1||[]), ...(arr2||[])]));
      return { ai: mergeUnique(aiServiceFeeds, extra), scrapy: mergeUnique(scrapyFeeds, extra) };
    };
    const probeSources = async (urls) => {
      const axios = require('axios');
      const tests = urls.map(async (u) => {
        const t0 = Date.now();
        try {
          const r = await axios.get(u, { timeout: 5000, maxRedirects: 3, validateStatus: ()=>true });
          const ok = r.status >= 200 && r.status < 400;
          return { url: u, ok, status: r.status, durationMs: Date.now()-t0 };
        } catch (e) {
          return { url: u, ok: false, error: e.code || e.message, durationMs: Date.now()-t0 };
        }
      });
      return Promise.all(tests);
    };

    const realTimeMonitor = require('./realTimeMonitor');
    // Determine which sources to probe
    const { ai, scrapy } = await buildSources();
    const selected = key === 'scrapy' ? scrapy : ai;
    const bySource = await probeSources(selected);
    realTimeMonitor.onScrapingStart(key);
    try {
      if (key === 'scrapy') {
        const result = await scheduler.scrapyService.runScraper();
        articles = result.articlesProcessed || 0;
      } else {
        // Simulated aggregate based on successful probes
        articles = bySource.filter(s=>s.ok).length;
      }
      realTimeMonitor.onScrapingEnd(articles, bySource.filter(s=>!s.ok).length, key);
    } catch (e) {
      realTimeMonitor.onScrapingEnd(0, bySource.filter(s=>!s.ok).length+1, key);
    }
    const durationMs = Date.now() - start;
    res.json({ success: true, library, articles, durationMs, bySource });
  } catch (e) {
    res.status(500).json({ success: false, error: e.message });
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
    res.json({ intervalSec });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

app.post('/api/scraping/config', async (req, res) => {
  try {
    const { intervalSec } = req.body || {};
    const value = parseInt(intervalSec);
    if (!Number.isFinite(value) || value <= 0) {
      return res.status(400).json({ success: false, error: 'intervalSec must be a positive integer' });
    }
    await db.setSetting('scrapping_interval_sec', String(value));
    // Immediate apply: scheduler reads from DB each tick, so new value is effective right away
    res.json({ success: true, intervalSec: value });
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
    const mergeUnique = (arr1, arr2) => Array.from(new Set([...(arr1||[]), ...(arr2||[])]));
    const aiMerged = mergeUnique(aiServiceFeeds, extra);
    const scrapyMerged = mergeUnique(scrapyFeeds, extra);
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
      // Return 200 with structured error to avoid polluting error metrics
      return res.json({ success: false, error: 'Model name is required' });
    }
    
    const OllamaService = require('./ollamaService');
    const ollama = new OllamaService();
    
    const result = await ollama.testModel(model);
    res.json(result);
  } catch (error) {
    console.error('Error testing Ollama model:', error);
    // Return 200 with structured error to avoid error counters for debug endpoint
    res.json({ success: false, error: error.message });
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
    const chatTokensSetting = parseInt(await db.getSetting('ollama_chat_num_predict')) || parseInt(process.env.OLLAMA_CHAT_NUM_PREDICT || '64');
    
    if (aiProvider === 'ollama') {
      const OllamaService = require('./ollamaService');
      const ollama = new OllamaService();
      
      const result = await ollama.chatWithModel(model, message, customPrompt, { numPredict: chatTokensSetting });
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
      return res.json({ success: false, error: 'Message is required' });
    }
    
    if (!socketId) {
      return res.json({ success: false, error: 'Socket ID is required for streaming' });
    }
    
    const startTime = Date.now();
    const chatTokensSetting = parseInt(await db.getSetting('ollama_chat_num_predict')) || parseInt(process.env.OLLAMA_CHAT_NUM_PREDICT || '64');
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
      }, { numPredict: chatTokensSetting });
      
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
      return res.json({ success: false, error: 'Streaming not yet implemented for OpenAI' });
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

// Catch all handler for React app if build exists - MUST BE LAST!
try {
  if (fs.existsSync(path.join(buildDir, 'index.html'))) {
    app.get('*', (req, res) => {
      res.sendFile(path.join(buildDir, 'index.html'));
    });
  }
} catch {}

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