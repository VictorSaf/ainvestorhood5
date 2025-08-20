const cron = require('node-cron');
const Database = require('./database');
const os = require('os');
const AIService = require('./aiService');
const ScrapyService = require('./scrapyService');
const { resolveYahooSymbol } = require('./yahooResolver');
const monitoring = require('./monitoring');
const liveStream = require('./liveStream');

class NewsScheduler {
  constructor() {
    this.db = new Database();
    this.aiService = null;
    this.scrapyService = new ScrapyService();
    this.isRunning = false; // scheduler started
    this.isCollecting = false; // collection in progress guard
    // Utility bound methods
    this.normalizeTitle = (title) => (title || '')
      .toLowerCase()
      .replace(/[^a-z0-9\s]/g, ' ')
      .replace(/\s+/g, ' ')
      .trim();

    this.jaccardSimilar = (a, b) => {
      if (!a || !b) return 0;
      const setA = new Set(a.split(' '));
      const setB = new Set(b.split(' '));
      const intersection = new Set([...setA].filter(x => setB.has(x)));
      const union = new Set([...setA, ...setB]);
      return union.size === 0 ? 0 : intersection.size / union.size;
    };

    this.isTradableInstrument = (instrumentType, instrumentName, title = '') => {
      if (!instrumentName || !instrumentName.toString().trim()) return false;
      const name = instrumentName.toString().trim();
      const t = (instrumentType || '').toLowerCase();
      const text = `${name} ${title}`;
      // Stocks: ticker in parens or all-caps 1-6 chars, or exchange:ticker
      if (t === 'stocks') {
        if (/\(([A-Z]{1,6})\)/.test(text)) return true;
        if (/(nasdaq|nyse|amex|tsx|lse|sehk)\s*[:\-]\s*[A-Z]{1,6}/i.test(text)) return true;
        if (/\b[A-Z]{1,6}\b/.test(name)) return true;
        return false;
      }
      // Forex: currency pairs like EUR/USD or USDJPY
      if (t === 'forex') {
        if (/\b([A-Z]{3})\/?([A-Z]{3})\b/.test(text)) return true;
        return false;
      }
      // Crypto: common tickers or names
      if (t === 'crypto') {
        if (/\b(BTC|ETH|SOL|ADA|XRP|DOGE|USDT|USDC|BNB)\b/i.test(text)) return true;
        if (/\b(bitcoin|ethereum|solana|cardano|ripple|dogecoin)\b/i.test(text)) return true;
        return false;
      }
      // Commodities: gold, oil, wti, brent, silver, copper, corn, wheat, etc.
      if (t === 'commodities') {
        if (/\b(gold|silver|oil|brent|wti|copper|corn|wheat|soy|natural gas)\b/i.test(text)) return true;
        return false;
      }
      // Indices: s&p, nasdaq 100, dow jones, dax, ftse, nikkei etc.
      if (t === 'indices') {
        if (/(s&p|sp500|nasdaq|dow|dax|ftse|nikkei|cac|hang seng|tsx)/i.test(text)) return true;
        return false;
      }
      return false;
    };
  }

  async init() {
    await this.initializeAIService();
    // Always start the scheduler so Scrapy-based collection can run without AI.
    this.startScheduler();
    console.log('News scheduler initialized (AI optional)');
  }

  async initializeAIService() {
    try {
      const aiProvider = await this.db.getSetting('ai_provider') || 'openai';
      
      if (aiProvider === 'openai') {
        const apiKey = await this.db.getSetting('openai_api_key');
        if (apiKey) {
          const customPrompt = await this.db.getSetting('custom_prompt');
          this.aiService = new AIService(apiKey, 'openai', null, customPrompt);
        }
      } else if (aiProvider === 'ollama') {
        const ollamaModel = await this.db.getSetting('ollama_model');
        const customPrompt = await this.db.getSetting('custom_prompt');
        if (ollamaModel) {
          this.aiService = new AIService(null, 'ollama', ollamaModel, customPrompt);
        }
      }
    } catch (error) {
      console.error('Error initializing AI service:', error);
    }
  }

  async setApiKey(apiKey) {
    await this.db.setSetting('openai_api_key', apiKey);
    await this.db.setSetting('ai_provider', 'openai');
    await this.initializeAIService();
    if (!this.isRunning) {
      this.startScheduler();
    }
    console.log('OpenAI API key set and scheduler started');
  }

  async setOllamaConfig(model, customPrompt = null) {
    await this.db.setSetting('ai_provider', 'ollama');
    await this.db.setSetting('ollama_model', model);
    if (customPrompt) {
      await this.db.setSetting('custom_prompt', customPrompt);
    }
    await this.initializeAIService();
    if (!this.isRunning) {
      this.startScheduler();
    }
    console.log(`Ollama model ${model} configured and scheduler started`);
  }

  startScheduler() {
    if (this.isRunning) return;

    // Run every 30 seconds for high-frequency updates (node-cron supports seconds)
    cron.schedule('*/30 * * * * *', async () => {
      // Skip if a previous run is still in progress
      if (this.isCollecting) {
        console.log('Previous collection still running, skipping this tick');
        return;
      }

      // Dynamic throttle: if 1‑minute load per core is high, skip
      const load1 = os.loadavg()[0] || 0;
      const cores = os.cpus().length || 1;
      const loadPerCore = load1 / cores;
      const minIntervalSec = parseInt(await this.db.getSetting('scrapping_interval_sec'))
        || parseInt(await this.db.getSetting('analysis_min_interval_sec'))
        || 30;
      // Skip under heavy load or if last run was too recent
      if (loadPerCore > 1.2) {
        console.log(`System under load (${load1.toFixed(2)} / ${cores} cores). Skipping collection.`);
        return;
      }
      if (this.lastRunAt && (Date.now() - this.lastRunAt) < minIntervalSec * 1000) {
        return;
      }

      console.log('Starting news collection...');
      await this.collectAndAnalyzeNews();
      this.lastRunAt = Date.now();
    });

    // Clean old articles every hour
    cron.schedule('0 * * * *', async () => {
      console.log('Cleaning old articles...');
      const deleted = await this.db.cleanOldArticles();
      console.log(`Deleted ${deleted} old articles`);
    });

    // Clean very old articles every 30 minutes to make room for new ones
    cron.schedule('*/30 * * * *', async () => {
      console.log('Cleaning very old articles...');
      const deleted = await this.db.cleanVeryOldArticles();
      if (deleted > 0) {
        console.log(`Deleted ${deleted} very old articles`);
      }
    });

    this.isRunning = true;
    console.log('News scheduler started - collecting news every 2 minutes');
  }

  async collectAndAnalyzeNews({ force = false } = {}) {
    if (this.isCollecting && !force) return;
    this.isCollecting = true;
    console.log('🚀 Starting Scrapy-based news collection...');
    monitoring.onNewsCollectionStart();
    liveStream.broadcastProcessingStatus(true);
    // Reset realtime counters for UI new/filtered
    liveStream.broadcastCollectionProgress({ started: true, processed: 0, duplicates: 0, errors: 0 });

    try {
      // Verifică dacă Scrapy este configurat
      const scrapyReady = await this.scrapyService.checkSetup();
      if (!scrapyReady) {
        console.log('⚠️  Scrapy not ready, attempting fallback...');
        const res = await this.collectWithLegacyMethod();
        this.isCollecting = false;
        return res;
      }

      // Rulează scraper-ul Scrapy
      const result = await this.scrapyService.runScraper();
      
      if (result.success) {
        const stats = {
          processed: Math.max(0, result.articlesProcessed || 0),
          duplicates: 0, // Scrapy gestionează duplicatele intern
          errors: 0,
          method: 'Scrapy'
        };

        console.log(`✅ Scrapy collection completed: ${stats.processed} articles processed`);
        monitoring.onNewsCollectionComplete(stats);
        liveStream.broadcastProcessingStatus(false);
        liveStream.broadcastCollectionProgress({ processed: stats.processed, duplicates: stats.duplicates, errors: stats.errors, completed: true });
        
        // Notifică live stream să sincronizeze articolele din DB
        try {
          const articles = await this.db.getRecentArticles(50);
          liveStream.syncArticles(articles);
        } catch (e) {
          console.warn('Failed to sync articles after Scrapy run:', e.message);
        }
        
        // If Scrapy produced zero items, always fallback to legacy method to avoid empty feed
        if (!stats.processed) {
          console.log('⚠️  Scrapy returned 0 items. Falling back to legacy collector to avoid empty feed...');
          const fallbackStats = await this.collectWithLegacyMethod();
          this.isCollecting = false;
          return fallbackStats;
        }
        
        this.isCollecting = false;
        return stats;
      } else {
        throw new Error(result.message || 'Scrapy collection failed');
      }

    } catch (error) {
      console.error('❌ Scrapy news collection failed:', error);
      
      // Fallback la metoda veche dacă Scrapy eșuează
      let res = null;
      if (this.aiService) {
        console.log('🔄 Falling back to legacy RSS collection...');
        res = await this.collectWithLegacyMethod();
      } else {
        console.log('ℹ️  Skipping legacy fallback (no AI configured).');
      }
      // Emit completion so UI resets counters even on failure
      liveStream.broadcastCollectionProgress({ processed: (res&&res.processed)||0, duplicates: (res&&res.duplicates)||0, errors: (res&&res.errors)||1, completed: true });
      this.isCollecting = false;
      return res;
    }
  }

  async collectWithLegacyMethod() {
    try {
      // Build in-memory duplicate guards from recent articles
      const recentExisting = await this.db.getRecentArticles(2000);
      const existingTitleFingerprints = new Set(
        recentExisting.map(a => this.normalizeTitle(a.title))
      );
      const existingTitles = recentExisting.map(a => a.title);
      const newlyAddedFingerprints = new Set();

      const isLikelyDuplicate = (title) => {
        const fp = this.normalizeTitle(title);
        if (!fp) return false;
        if (existingTitleFingerprints.has(fp)) return true;
        if (newlyAddedFingerprints.has(fp)) return true;
        // Soft similarity check against existing titles (token Jaccard)
        for (const t of existingTitles) {
          if (this.jaccardSimilar(fp, this.normalizeTitle(t)) >= 0.8) {
            return true;
          }
        }
        return false;
      };
      
      const newsResults = await this.aiService.searchFinancialNews();
      console.log(`Found ${newsResults.length} potential news articles`);

      let processedCount = 0;
      let duplicateCount = 0;
      let errorCount = 0;

      // Simple heuristic extractor as backup when AI is unavailable or inconclusive
      const extractHeuristic = (title, content) => {
        const text = `${title || ''} ${content || ''}`;
        // Stocks ticker in parentheses or exchange:ticker
        let m = text.match(/\(([A-Z]{1,6})\)/);
        if (m) return { type: 'Stocks', name: m[1] };
        m = text.match(/(nasdaq|nyse|amex|tsx|lse|sehk)\s*[:\-]\s*([A-Z]{1,6})/i);
        if (m) return { type: 'Stocks', name: m[2].toUpperCase() };
        // Forex pairs
        m = text.match(/\b([A-Z]{3})\/?([A-Z]{3})\b/);
        if (m) return { type: 'Forex', name: `${m[1].toUpperCase()}/${m[2].toUpperCase()}` };
        // Crypto tickers or names
        m = text.match(/\b(BTC|ETH|SOL|ADA|XRP|DOGE|USDT|USDC|BNB)\b/i);
        if (m) return { type: 'Crypto', name: m[1].toUpperCase() };
        m = text.match(/\b(bitcoin|ethereum|solana|cardano|ripple|dogecoin)\b/i);
        if (m) {
          const map = { bitcoin: 'BTC', ethereum: 'ETH', solana: 'SOL', cardano: 'ADA', ripple: 'XRP', dogecoin: 'DOGE' };
          return { type: 'Crypto', name: map[m[1].toLowerCase()] || m[1].toUpperCase() };
        }
        // Commodities
        m = text.match(/\b(gold|silver|oil|brent|wti|copper|corn|wheat|soy|natural gas)\b/i);
        if (m) return { type: 'Commodities', name: m[1].toString().replace(/\b\w/g, c => c.toUpperCase()) };
        // Indices
        if (/(s&p|sp500|nasdaq|dow|dax|ftse|nikkei|cac|hang\s*seng|tsx)/i.test(text)) return { type: 'Indices', name: 'Index' };
        return null;
      };

      for (const newsItem of newsResults) {
        try {
          // Fetch full article content
          const content = await this.aiService.fetchArticleContent(newsItem.url);
          if (!content) continue;

          // Generate content hash for duplicate detection
          const contentHash = this.aiService.generateContentHash(newsItem.title, content);

          // Check if this is a duplicate
          const isDuplicate = await this.db.isDuplicate(contentHash);
          if (isDuplicate || isLikelyDuplicate(newsItem.title)) {
            duplicateCount++;
            continue;
          }

          // Analyze the article with AI
          const startTime = Date.now();
          let analysis = await this.aiService.analyzeNewsArticle(newsItem.title, content, newsItem.url);
          // Skip HOLD as requested
          if (String(analysis?.recommendation || '').toUpperCase() === 'HOLD') {
            console.log(`Skipping HOLD recommendation: ${newsItem.title.substring(0,60)}...`);
            continue;
          }
          if (!analysis || !analysis.instrument_name || !analysis.instrument_type) {
            const h = extractHeuristic(newsItem.title, content);
            if (!h) {
              console.log(`Skipping article: ${newsItem.title} - analysis failed`);
              errorCount++;
              continue;
            }
            analysis = {
              summary: content.slice(0, 500),
              instrument_type: h.type,
              instrument_name: h.name,
              recommendation: 'HOLD',
              confidence_score: 50
            };
          }

          // Enforce tradable instrument requirement (must have identifiable, non-empty name)
          if (!this.isTradableInstrument(analysis.instrument_type, analysis.instrument_name, newsItem.title)) {
            console.log(`Skipping article: ${newsItem.title} - no tradable instrument identified`);
            errorCount++;
            continue;
          }

          // Track AI usage for news analysis
          const processingTime = Date.now() - startTime;
          const realTimeMonitor = require('./realTimeMonitor');
          const aiProvider = (await this.db.getSetting('ai_provider')) || 'openai';
          realTimeMonitor.recordAIRequest(aiProvider, processingTime, analysis.tokens || 0);

          // Validate that all required fields are present
          if (!analysis.summary || !analysis.recommendation || !analysis.confidence_score) {
            console.log(`Skipping article: ${newsItem.title} - incomplete analysis`);
            errorCount++;
            continue;
          }

          // Try to resolve Yahoo symbol to improve link accuracy; if unresolved, keep original instrument (do not drop)
          try {
            const resolvedSymbol = await resolveYahooSymbol(analysis.instrument_type, analysis.instrument_name, newsItem.title);
            if (resolvedSymbol) {
              analysis.instrument_name = resolvedSymbol;
            }
          } catch {}

          // Save to database (DB layer also enforces instrument_name presence)
          const article = {
            title: newsItem.title,
            summary: analysis.summary,
            instrument_type: analysis.instrument_type,
            instrument_name: analysis.instrument_name || null,
            recommendation: analysis.recommendation,
            confidence_score: analysis.confidence_score,
            source_url: newsItem.url,
            content_hash: contentHash,
            // Prefer published_at from feed; fallback to current UTC ISO
            published_at: (newsItem.pubDate && new Date(newsItem.pubDate).toISOString()) || new Date().toISOString()
          };

          try {
            const articleId = await this.db.addArticle(article);
            // Retrieve the freshly inserted row to include accurate created_at from DB
            const articleFromDb = await this.db.getArticleById(articleId);
            // Track fingerprint to avoid dupes within the same batch
            newlyAddedFingerprints.add(this.normalizeTitle(articleFromDb.title));
            processedCount++;
            console.log(`✅ Added article: ${articleFromDb.title.substring(0, 60)}...`);
            
            // Monitor successful article processing
            monitoring.onArticleProcessed('added');
            monitoring.onDatabaseActivity('insert', { totalArticles: processedCount });
            
            // Broadcast new article via live stream, including created_at from DB
            liveStream.broadcastNewArticle(articleFromDb);
            
          } catch (dbError) {
            if (dbError.message.includes('Duplicate article')) {
              duplicateCount++;
              console.log(`⚠️ Duplicate: ${article.title.substring(0, 60)}...`);
              monitoring.onArticleProcessed('duplicate');
            } else {
              errorCount++;
              console.error('Database error:', dbError.message);
              monitoring.onArticleProcessed('error');
            }
          }

        } catch (error) {
          console.error('Error processing news item:', error.message);
          errorCount++;
        }
      }

      console.log(`News collection completed: ${processedCount} new articles, ${duplicateCount} duplicates, ${errorCount} errors`);
      
      // Broadcast collection completion
      liveStream.broadcastProcessingStatus(false);
      liveStream.broadcastCollectionProgress({ processed: processedCount, duplicates: duplicateCount, errors: errorCount, completed: true });

      // Sync latest articles to all clients
      try {
        const articles = await this.db.getRecentArticles(50);
        liveStream.syncArticles(articles);
      } catch (e) {
        console.warn('Failed to sync articles after legacy run:', e.message);
      }

    } catch (error) {
      console.error('Error in news collection:', error);
      liveStream.broadcastProcessingStatus(false);
    }
  }

  async runOnce({ force = false } = {}) {
    console.log('Running news collection once...');
    await this.collectAndAnalyzeNews({ force });
  }

  stop() {
    this.isRunning = false;
    console.log('News scheduler stopped');
  }
}

module.exports = NewsScheduler;