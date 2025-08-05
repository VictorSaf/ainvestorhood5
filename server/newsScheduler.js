const cron = require('node-cron');
const Database = require('./database');
const AIService = require('./aiService');
const ScrapyService = require('./scrapyService');
const UnifiedScrapingService = require('./unifiedScrapingService');
const monitoring = require('./monitoring');
const liveStream = require('./liveStream');

class NewsScheduler {
  constructor() {
    this.db = new Database();
    this.aiService = null;
    this.scrapyService = new ScrapyService();
    this.unifiedScrapingService = new UnifiedScrapingService();
    this.isRunning = false;
  }

  async init() {
    await this.initializeAIService();
    await this.initializeScrapingService();
    if (this.aiService) {
      this.startScheduler();
      console.log('News scheduler initialized');
    } else {
      console.log('No AI configuration found. Scheduler will start after setup is complete.');
    }
  }

  async initializeScrapingService() {
    try {
      const savedMethod = await this.db.getSetting('scraping_method');
      if (savedMethod && this.unifiedScrapingService.getAvailableMethods().some(m => m.name === savedMethod)) {
        this.unifiedScrapingService.setScrapingMethod(savedMethod);
        console.log(`🔧 Scraping service initialized with: ${this.unifiedScrapingService.getDisplayName(savedMethod)}`);
      } else {
        console.log(`🔧 Scraping service initialized with default: ${this.unifiedScrapingService.getDisplayName('feedparser')}`);
      }
    } catch (error) {
      console.warn('⚠️ Could not initialize scraping service, using default:', error.message);
    }
  }

  async initializeAIService() {
    try {
      const aiProvider = await this.db.getSetting('ai_provider') || 'openai';
      
      // Load token limits from database
      const tokenLimitsStr = await this.db.getSetting('token_limits');
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
      
      if (aiProvider === 'openai') {
        const apiKey = await this.db.getSetting('openai_api_key');
        if (apiKey) {
          const customPrompt = await this.db.getSetting('custom_prompt');
          this.aiService = new AIService(apiKey, 'openai', null, customPrompt, tokenLimits);
        }
      } else if (aiProvider === 'ollama') {
        const ollamaModel = await this.db.getSetting('ollama_model');
        const customPrompt = await this.db.getSetting('custom_prompt');
        if (ollamaModel) {
          this.aiService = new AIService(null, 'ollama', ollamaModel, customPrompt, tokenLimits);
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

    // Run every 2 minutes to reduce server load
    cron.schedule('*/2 * * * *', async () => {
      if (!this.aiService) {
        console.log('No AI service available, skipping news collection');
        return;
      }

      console.log('Starting news collection...');
      await this.collectAndAnalyzeNews();
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
    console.log('News scheduler started - collecting news every 2 minutes (optimized for performance)');
  }

  async collectAndAnalyzeNews() {
    console.log('🚀 Starting RSS-based news collection...');
    monitoring.onNewsCollectionStart();
    liveStream.broadcastProcessingStatus(true);

    try {
      // Folosește direct metoda RSS legacy (Scrapy are probleme)
      console.log('📡 Using RSS legacy collection method...');
      return await this.collectWithLegacyMethod();

    } catch (error) {
      console.error('❌ RSS news collection failed:', error);
      liveStream.broadcastProcessingStatus(false);
      
      const stats = {
        processed: 0,
        duplicates: 0,
        errors: 1,
        method: 'RSS'
      };
      
      monitoring.onNewsCollectionComplete(stats);
      return stats;
    }
  }

  async collectWithLegacyMethod() {
    try {
      // Notify monitoring system about RSS collection start
      const realTimeMonitor = require('./realTimeMonitor');
      realTimeMonitor.onScrapyStart(); // Reusing scrapy monitoring for RSS
      
      const newsResults = await this.aiService.searchFinancialNews();
      console.log(`Found ${newsResults.length} potential news articles`);

      let processedCount = 0;
      let duplicateCount = 0;
      let errorCount = 0;
      const maxArticlesPerRun = 5; // Further reduced to speed up processing

      console.log(`📊 Processing up to ${maxArticlesPerRun} articles from ${newsResults.length} available`);

      for (let i = 0; i < Math.min(newsResults.length, maxArticlesPerRun); i++) {
        const newsItem = newsResults[i];
        try {
          console.log(`Processing article: ${newsItem.title}`);
          
          // Fetch full article content
          const content = await this.aiService.fetchArticleContent(newsItem.url);
          if (!content) {
            console.log(`No content fetched for: ${newsItem.title}`);
            continue;
          }

          // Generate content hash for duplicate detection
          const contentHash = this.aiService.generateContentHash(newsItem.title, content);

          // Check if this is a duplicate
          const isDuplicate = await this.db.isDuplicate(contentHash);
          if (isDuplicate) {
            duplicateCount++;
            continue;
          }

          // Analyze the article with AI
          const startTime = Date.now();
          const analysis = await this.aiService.analyzeNewsArticle(newsItem.title, content, newsItem.url);
          if (!analysis) {
            console.log(`Skipping article: ${newsItem.title} - analysis failed`);
            errorCount++;
            continue;
          }

          // Track AI usage for news analysis
          const processingTime = Date.now() - startTime;
          try {
            const realTimeMonitor = require('./realTimeMonitor');
            const aiProvider = (await this.db.getSetting('ai_provider')) || 'openai';
            realTimeMonitor.recordAIRequest(aiProvider, processingTime, analysis.tokens || 0);
          } catch (monitorError) {
            console.warn('Failed to record AI request metrics:', monitorError.message);
          }

          // Validate that all required fields are present
          if (!analysis.summary || !analysis.recommendation || !analysis.confidence_score) {
            console.log(`Skipping article: ${newsItem.title} - incomplete analysis`);
            errorCount++;
            continue;
          }

          // Save to database
          const article = {
            title: newsItem.title,
            summary: analysis.summary,
            instrument_type: analysis.instrument_type,
            instrument_name: analysis.instrument_name || null,
            recommendation: analysis.recommendation,
            confidence_score: analysis.confidence_score,
            source_url: newsItem.url,
            content_hash: contentHash,
            published_at: newsItem.pubDate || new Date().toISOString()
          };

          try {
            const articleId = await this.db.addArticle(article);
            article.id = articleId;
            processedCount++;
            console.log(`✅ Added article: ${article.title.substring(0, 60)}...`);
            
            // Monitor successful article processing
            monitoring.onArticleProcessed('added');
            monitoring.onDatabaseActivity('insert', { totalArticles: processedCount });
            
            // Broadcast new article via live stream
            liveStream.broadcastNewArticle(article);
            
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
          console.error('Error stack:', error.stack);
          console.error('Article details:', { title: newsItem?.title, url: newsItem?.url });
          errorCount++;
        }
      }

      console.log(`News collection completed: ${processedCount} new articles, ${duplicateCount} duplicates, ${errorCount} errors`);
      
      // Broadcast collection completion
      liveStream.broadcastProcessingStatus(false);
      liveStream.broadcastCollectionProgress({
        processed: processedCount,
        duplicates: duplicateCount,
        errors: errorCount,
        completed: true
      });

      // Sync all articles from database to WebSocket clients
      await liveStream.syncArticles();

      // Notify monitoring system about RSS collection completion
      realTimeMonitor.onScrapyEnd(processedCount, errorCount);
      
      return {
        processed: processedCount,
        duplicates: duplicateCount,
        errors: errorCount,
        method: 'RSS'
      };

    } catch (error) {
      console.error('Error in news collection:', error);
      liveStream.broadcastProcessingStatus(false);
      
      // Notify monitoring system about RSS collection failure
      const realTimeMonitor = require('./realTimeMonitor');
      realTimeMonitor.onScrapyEnd(0, 1);
    }
  }

  async runOnce() {
    if (!this.aiService) {
      throw new Error('AI service not initialized. Please set API key first.');
    }
    
    console.log('Running news collection once...');
    await this.collectAndAnalyzeNews();
  }

  stop() {
    this.isRunning = false;
    console.log('News scheduler stopped');
  }
}

module.exports = NewsScheduler;