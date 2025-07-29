const cron = require('node-cron');
const Database = require('./database');
const AIService = require('./aiService');
const ScrapyService = require('./scrapyService');
const monitoring = require('./monitoring');
const liveStream = require('./liveStream');

class NewsScheduler {
  constructor() {
    this.db = new Database();
    this.aiService = null;
    this.scrapyService = new ScrapyService();
    this.isRunning = false;
  }

  async init() {
    await this.initializeAIService();
    if (this.aiService) {
      this.startScheduler();
      console.log('News scheduler initialized');
    } else {
      console.log('No AI configuration found. Scheduler will start after setup is complete.');
    }
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

    // Run every 2 minutes for more frequent updates
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
    console.log('News scheduler started - collecting news every 2 minutes');
  }

  async collectAndAnalyzeNews() {
    console.log('🚀 Starting Scrapy-based news collection...');
    monitoring.onNewsCollectionStart();
    liveStream.broadcastProcessingStatus(true);

    try {
      // Verifică dacă Scrapy este configurat
      const scrapyReady = await this.scrapyService.checkSetup();
      if (!scrapyReady) {
        console.log('⚠️  Scrapy not ready, attempting fallback...');
        return await this.collectWithRSSFallback();
      }

      // Rulează scraper-ul Scrapy
      const result = await this.scrapyService.runScraper();
      
      if (result.success) {
        const stats = {
          processed: result.articlesProcessed || 0,
          duplicates: 0, // Scrapy gestionează duplicatele intern
          errors: 0,
          method: 'Scrapy'
        };

        console.log(`✅ Scrapy collection completed: ${stats.processed} articles processed`);
        monitoring.onNewsCollectionComplete(stats);
        liveStream.broadcastProcessingStatus(false);
        
        // Notifică live stream să sincronizeze articolele
        liveStream.syncArticles();
        
        return stats;
      } else {
        throw new Error(result.message || 'Scrapy collection failed');
      }

    } catch (error) {
      console.error('❌ Scrapy news collection failed:', error);
      
      // Fallback la metoda veche dacă Scrapy eșuează
      console.log('🔄 Falling back to legacy RSS collection...');
      return await this.collectWithLegacyMethod();
    }
  }

  async collectWithLegacyMethod() {
    try {
      
      const newsResults = await this.aiService.searchFinancialNews();
      console.log(`Found ${newsResults.length} potential news articles`);

      let processedCount = 0;
      let duplicateCount = 0;
      let errorCount = 0;

      for (const newsItem of newsResults) {
        try {
          // Fetch full article content
          const content = await this.aiService.fetchArticleContent(newsItem.url);
          if (!content) continue;

          // Generate content hash for duplicate detection
          const contentHash = this.aiService.generateContentHash(newsItem.title, content);

          // Check if this is a duplicate
          const isDuplicate = await this.db.isDuplicate(contentHash);
          if (isDuplicate) {
            duplicateCount++;
            continue;
          }

          // Analyze the article with AI
          const analysis = await this.aiService.analyzeNewsArticle(newsItem.title, content, newsItem.url);
          if (!analysis) {
            console.log(`Skipping article: ${newsItem.title} - analysis failed`);
            errorCount++;
            continue;
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

    } catch (error) {
      console.error('Error in news collection:', error);
      liveStream.broadcastProcessingStatus(false);
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