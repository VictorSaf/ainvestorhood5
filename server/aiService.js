const OpenAI = require('openai');
const axios = require('axios');
const cheerio = require('cheerio');
const crypto = require('crypto');
const Parser = require('rss-parser');
const AdvancedScraper = require('./advancedScraper');
const OllamaService = require('./ollamaService');

class AIService {
  constructor(apiKey, aiProvider = 'openai', ollamaModel = null, customPrompt = null, tokenLimits = null) {
    this.aiProvider = aiProvider;
    this.customPrompt = customPrompt;
    this.tokenLimits = tokenLimits || {
      chat: 1000,
      analysis: 800,
      streaming: 1000,
      test: 50
    };
    
    if (aiProvider === 'openai') {
      this.openai = new OpenAI({
        apiKey: apiKey
      });
    } else if (aiProvider === 'ollama') {
      this.ollama = new OllamaService();
      this.ollamaModel = ollamaModel;
    }
    
    this.parser = new Parser({
      timeout: 5000, // Reduced from 10s to 5s
      headers: {
        'User-Agent': 'Mozilla/5.0 (compatible; NewsBot/1.0; +http://localhost:8080)'
      }
    });
    this.scraper = new AdvancedScraper();
  }

  async searchFinancialNews() {
    // Focus on most reliable feeds only (removed problematic CNN feed)
    const primaryFeeds = [
      'https://feeds.feedburner.com/zerohedge/feed',
      'https://seekingalpha.com/feed.xml',
      'https://feeds.feedburner.com/TheMotleyFool',
      'https://www.marketwatch.com/rss/topstories',
      'https://cointelegraph.com/rss',
      'https://feeds.feedburner.com/CoinDesk'
    ];

    console.log(`Fetching news from ${primaryFeeds.length} primary RSS feeds...`);
    
    // Use Promise.allSettled for parallel processing with timeout handling
    const feedPromises = primaryFeeds.map(async (feedUrl) => {
      try {
        const timeoutPromise = new Promise((_, reject) => 
          setTimeout(() => reject(new Error('Feed timeout')), 3000) // Reduced from 6s to 3s
        );
        
        const feed = await Promise.race([
          this.parser.parseURL(feedUrl),
          timeoutPromise
        ]);
        
        // Take only latest 5 items per feed for faster processing
        const recentItems = feed.items.slice(0, 5);
        const newsItems = [];
        
        for (const item of recentItems) {
          if (this.isFinancialContent(item.title, item.contentSnippet || item.description)) {
            newsItems.push({
              title: item.title,
              url: item.link,
              description: item.contentSnippet || item.description || '',
              pubDate: item.pubDate,
              source: this.extractSourceFromUrl(feedUrl)
            });
          }
        }
        
        console.log(`✅ Fetched ${newsItems.length} articles from ${this.extractSourceFromUrl(feedUrl)}`);
        return newsItems;
        
      } catch (error) {
        console.error(`❌ Error fetching feed ${feedUrl}:`, error.message);
        return [];
      }
    });

    const results = await Promise.allSettled(feedPromises);
    
    // Flatten successful results
    const allNews = results
      .filter(result => result.status === 'fulfilled')
      .flatMap(result => result.value);

    console.log(`📰 Total articles collected: ${allNews.length}`);

    // Sort by date and return latest 15 articles (reduced for faster processing)
    return allNews
      .sort((a, b) => new Date(b.pubDate) - new Date(a.pubDate))
      .slice(0, 15);
  }

  isFinancialContent(title, description) {
    const text = (title + ' ' + description).toLowerCase();
    
    // First, exclude non-financial content with political/social keywords
    const excludeKeywords = [
      'kamala', 'harris', 'biden', 'trump', 'election', 'vote', 'political', 'politics',
      'republican', 'democrat', 'congress', 'senate', 'house', 'government', 'president',
      'vice president', 'campaign', 'rally', 'debate', 'policy', 'administration',
      'tulsi', 'gabbard', 'book', 'memoir', 'biography', 'author', 'publishing',
      'celebrity', 'entertainment', 'movie', 'film', 'tv show', 'actor', 'actress',
      'sports', 'football', 'basketball', 'baseball', 'soccer', 'athlete', 'game',
      'war', 'military', 'defense', 'conflict', 'ukraine', 'russia', 'china',
      'climate', 'weather', 'environment', 'global warming', 'carbon', 'green energy'
    ];
    
    // Exclude articles containing political/non-financial terms
    if (excludeKeywords.some(keyword => text.includes(keyword))) {
      return false;
    }
    
    // Require strong financial indicators
    const strongFinancialKeywords = [
      'stock price', 'share price', 'earnings', 'revenue', 'profit', 'loss',
      'quarterly', 'financial results', 'balance sheet', 'cash flow',
      'dividend', 'buyback', 'ipo', 'merger', 'acquisition',
      'nasdaq', 'nyse', 'dow jones', 's&p 500', 'ftse', 'dax', 'nikkei',
      'forex', 'currency', 'exchange rate', 'trading', 'investor',
      'bitcoin', 'ethereum', 'cryptocurrency', 'crypto', 'blockchain',
      'gold price', 'oil price', 'commodity', 'futures', 'options',
      'fed rate', 'interest rate', 'inflation rate', 'gdp growth',
      'market cap', 'valuation', 'analyst', 'upgrade', 'downgrade',
      'target price', 'price target', 'buy rating', 'sell rating',
      'financial', 'banking', 'fintech', 'investment', 'fund'
    ];
    
    // Must contain at least one strong financial indicator
    const hasFinancialContent = strongFinancialKeywords.some(keyword => text.includes(keyword));
    
    // Additional check: look for company names, ticker symbols, or market terms
    const companyIndicators = [
      /\b[A-Z]{2,5}\b.*stock/i,  // Ticker symbols followed by stock
      /\b(inc|corp|ltd|llc|company)\b/i,  // Corporate suffixes
      /\$([\d,]+\.?\d*)(b|bn|billion|m|mn|million)/i,  // Dollar amounts in millions/billions
      /market/i,  // Market mentions
      /trading/i  // Trading mentions
    ];
    
    const hasCompanyIndicators = companyIndicators.some(pattern => pattern.test(text));
    
    return hasFinancialContent || hasCompanyIndicators;
  }

  extractSourceFromUrl(url) {
    try {
      const domain = new URL(url).hostname;
      if (domain.includes('reuters')) return 'Reuters';
      if (domain.includes('bloomberg')) return 'Bloomberg';
      if (domain.includes('yahoo')) return 'Yahoo Finance';
      if (domain.includes('marketwatch')) return 'MarketWatch';
      if (domain.includes('cnn')) return 'CNN Business';
      if (domain.includes('seekingalpha')) return 'Seeking Alpha';
      if (domain.includes('investing')) return 'Investing.com';
      if (domain.includes('zerohedge')) return 'ZeroHedge';
      return domain;
    } catch {
      return 'Unknown';
    }
  }

  async performWebSearch(query) {
    // This method is no longer used but kept for compatibility
    return [];
  }

  async analyzeNewsArticle(title, content, url) {
    if (this.aiProvider === 'ollama' && this.ollama && this.ollamaModel) {
      return await this.analyzeWithOllama(title, content, url);
    } else {
      return await this.analyzeWithOpenAI(title, content, url);
    }
  }

  async analyzeWithOllama(title, content, url) {
    try {
      const prompt = this.customPrompt || `You are an expert financial analyst. Analyze ONLY financial news articles about specific tradeable instruments.

REJECT immediately if the article is about:
- Politics (Biden, Trump, Kamala Harris, elections, etc.)
- Books, memoirs, biographies, or personal stories
- Entertainment, sports, or celebrities
- General economic policy without specific instruments

ONLY ANALYZE if the article mentions specific tradeable instruments:
1. A concise summary (max 100 words) in simple language
2. The financial instrument type (stocks, forex, crypto, commodities, indices)
3. SPECIFIC instrument name (company name, ticker symbol, crypto name, etc.) - REQUIRED
4. Trading recommendation (BUY, SELL, or HOLD)
5. Confidence score (1-100) for the recommendation

CRITICAL: You MUST identify a specific financial instrument (like "Apple", "AAPL", "Tesla", "Bitcoin", "EUR/USD", "S&P 500"). If the article is about politics, books, or doesn't mention specific tradeable instruments, return null.`;

      const result = await this.ollama.analyzeNewsWithOllama(this.ollamaModel, prompt, title, content, url, this.tokenLimits.analysis);
      
      if (result) {
        return this.validateAnalysis(result, title);
      }
      
      return null;
    } catch (error) {
      console.error('Error analyzing with Ollama:', error);
      return null;
    }
  }

  async analyzeWithOpenAI(title, content, url) {
    try {
      const systemPrompt = this.customPrompt || `You are an expert financial analyst. Analyze ONLY financial news articles about specific tradeable instruments.

REJECT immediately if the article is about:
- Politics (Biden, Trump, Kamala Harris, elections, etc.)
- Books, memoirs, biographies, or personal stories  
- Entertainment, sports, or celebrities
- General economic policy without specific instruments

ONLY ANALYZE if the article mentions specific tradeable instruments:
1. A concise summary (max 100 words) in simple language
2. The financial instrument type (stocks, forex, crypto, commodities, indices)
3. SPECIFIC instrument name (company name, ticker symbol, crypto name, etc.) - REQUIRED
4. Trading recommendation (BUY, SELL, or HOLD)
5. Confidence score (1-100) for the recommendation

CRITICAL: You MUST identify a specific financial instrument (like "Apple", "AAPL", "Tesla", "Bitcoin", "EUR/USD", "S&P 500"). If the article is about politics, books, or doesn't mention specific tradeable instruments, return null.

Return ONLY a JSON object with: summary, instrument_type, instrument_name, recommendation, confidence_score`;

      // Add timeout for AI analysis
      const aiTimeout = new Promise((_, reject) => 
        setTimeout(() => reject(new Error('AI analysis timeout')), 10000) // 10 second timeout
      );

      const aiRequest = this.openai.chat.completions.create({
        model: "gpt-4",
        messages: [
          {
            role: "system",
            content: systemPrompt
          },
          {
            role: "user",
            content: `Article Title: ${title}\n\nContent: ${content}\n\nURL: ${url}`
          }
        ],
        max_tokens: this.tokenLimits.analysis,
        temperature: 0.2
      });

      const response = await Promise.race([aiRequest, aiTimeout]);

      const analysis = JSON.parse(response.choices[0].message.content);
      
      return this.validateAnalysis(analysis, title);
    } catch (error) {
      console.error('Error analyzing with OpenAI:', error);
      return this.getDefaultAnalysis(title);
    }
  }

  validateAnalysis(analysis, title) {
    // Ensure all required fields exist with defaults
    const result = {
      summary: analysis.summary || `Analysis of: ${title.substring(0, 100)}...`,
      instrument_type: analysis.instrument_type || 'stocks',
      instrument_name: analysis.instrument_name || null,
      recommendation: analysis.recommendation || 'HOLD',
      confidence_score: parseInt(analysis.confidence_score) || 50
    };

    // Validate recommendation
    if (!['BUY', 'SELL', 'HOLD'].includes(result.recommendation)) {
      result.recommendation = 'HOLD';
    }

    // Validate confidence score
    result.confidence_score = Math.max(1, Math.min(100, result.confidence_score));

    // Validate financial instrument - reject if too generic or unclear
    if (!this.isValidFinancialInstrument(result.instrument_name, result.instrument_type)) {
      return null; // Reject this article
    }

    return result;
  }

  isValidFinancialInstrument(instrumentName, instrumentType) {
    // Reject if no specific instrument name
    if (!instrumentName || typeof instrumentName !== 'string' || instrumentName.trim().length < 2) {
      return false;
    }

    const name = instrumentName.toLowerCase().trim();
    
    // Explicitly reject political/non-financial terms
    const politicalTerms = [
      'kamala', 'harris', 'biden', 'trump', 'president', 'vice president',
      'tulsi', 'gabbard', 'book', 'memoir', 'author', 'publisher',
      'republican', 'democrat', 'congress', 'senate', 'election',
      'campaign', 'political', 'politics', 'policy', 'administration',
      'government', 'federal', 'state', 'military', 'defense'
    ];

    // Reject any political/personal names
    if (politicalTerms.some(term => name.includes(term))) {
      return false;
    }
    
    // Generic/vague terms to reject
    const genericTerms = [
      'stocks', 'stock', 'shares', 'equity', 'equities',
      'market', 'markets', 'trading', 'investment', 'investments',
      'finance', 'financial', 'economy', 'economic',
      'crypto', 'cryptocurrency', 'bitcoin', 'ethereum', 'coins',
      'forex', 'currency', 'currencies', 'dollar', 'euro',
      'commodity', 'commodities', 'gold', 'oil', 'energy',
      'index', 'indices', 'sector', 'industry',
      'fund', 'funds', 'portfolio', 'bond', 'bonds',
      'derivatives', 'options', 'futures',
      'general', 'various', 'multiple', 'several', 'mixed',
      'unspecified', 'unknown', 'unclear', 'tbd', 'n/a', 'null'
    ];

    // Reject generic terms
    if (genericTerms.includes(name)) {
      return false;
    }

    // Reject very short names (likely generic)
    if (name.length < 3) {
      return false;
    }

    // Must contain at least one letter or number (not just symbols)
    if (!/[a-zA-Z0-9]/.test(name)) {
      return false;
    }

    // Additional validation: reject names that sound like people or books
    const personalNamePatterns = [
      /\b(mr|mrs|ms|dr|prof)\b/,
      /book$/,
      /memoir$/,
      /biography$/,
      /story$/,
      /tale$/
    ];

    if (personalNamePatterns.some(pattern => pattern.test(name))) {
      return false;
    }

    // Valid specific instrument examples:
    // - Company names: "Apple", "Tesla", "Microsoft", "AAPL", "TSLA"
    // - Specific cryptos: "Solana", "Cardano", "Polygon"
    // - Specific commodities: "WTI Crude", "Brent Oil", "Natural Gas"
    // - Specific currencies: "USD/EUR", "GBP/JPY"
    // - Specific indices: "S&P 500", "NASDAQ 100", "Dow Jones"

    console.log(`✅ Validated financial instrument: "${instrumentName}" (${instrumentType})`);
    return true; // Passed all validation checks
  }

  getDefaultAnalysis(title) {
    return {
      summary: `Financial news analysis for: ${title.substring(0, 80)}...`,
      instrument_type: 'stocks',
      instrument_name: null,
      recommendation: 'HOLD',
      confidence_score: 50
    };
  }

  generateContentHash(title, content) {
    // Create a more specific hash that includes URL and timestamp
    const normalizedTitle = title.toLowerCase().trim();
    const normalizedContent = content.toLowerCase().trim().substring(0, 200);
    const hashInput = normalizedTitle + normalizedContent;
    return crypto.createHash('md5').update(hashInput).digest('hex');
  }

  async fetchArticleContent(url) {
    return await this.scraper.intelligentScrape(url);
  }

  async testOpenAI() {
    try {
      const response = await this.openai.chat.completions.create({
        model: "gpt-4",
        messages: [
          {
            role: "system",
            content: "You are a test assistant. Please respond with a simple confirmation message."
          },
          {
            role: "user",
            content: "Hello, please confirm that OpenAI is working correctly."
          }
        ],
        max_tokens: this.tokenLimits.test,
        temperature: 0.2
      });

      return {
        success: true,
        response: response.choices[0].message.content,
        model: "gpt-4"
      };
    } catch (error) {
      return {
        success: false,
        error: error.message,
        model: "gpt-4"
      };
    }
  }

  async chatWithOpenAI(message) {
    try {
      const systemPrompt = this.customPrompt || "You are a helpful AI assistant. Please provide clear and informative responses.";

      const response = await this.openai.chat.completions.create({
        model: "gpt-4",
        messages: [
          {
            role: "system",
            content: systemPrompt
          },
          {
            role: "user",
            content: message
          }
        ],
        max_tokens: this.tokenLimits.chat,
        temperature: 0.7
      });

      return {
        success: true,
        response: response.choices[0].message.content,
        model: "gpt-4",
        tokens: response.usage
      };
    } catch (error) {
      return {
        success: false,
        error: error.message,
        response: `Error: ${error.message}`,
        model: "gpt-4"
      };
    }
  }
}

module.exports = AIService;