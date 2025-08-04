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
      timeout: 10000,
      headers: {
        'User-Agent': 'Mozilla/5.0 (compatible; NewsBot/1.0; +http://localhost:8080)'
      }
    });
    this.scraper = new AdvancedScraper();
  }

  async searchFinancialNews() {
    const newsFeeds = [
      'https://feeds.feedburner.com/zerohedge/feed',
      'https://seekingalpha.com/feed.xml',
      'https://feeds.feedburner.com/TheMotleyFool',
      'https://www.investing.com/rss/news.rss',
      'https://rss.cnn.com/rss/money_latest.rss',
      'https://feeds.npr.org/1003/rss.xml',
      'https://feeds.washingtonpost.com/rss/business',
      'https://www.nasdaq.com/feed/rssoutbound?category=US%20Markets',
      'https://feeds.finance.yahoo.com/rss/2.0/headline',
      // Additional financial news sources
      'https://feeds.bloomberg.com/markets/news.rss',
      'https://www.marketwatch.com/rss/topstories',
      'https://feeds.a.dj.com/rss/RSSMarketsMain.xml',
      'https://feeds.reuters.com/reuters/businessNews',
      'https://feeds.financial-planning.com/financial-planning/news',
      'https://feeds.feedburner.com/TheStreet',
      'https://rss.cnn.com/rss/money_markets.rss',
      'https://feeds.feedburner.com/InvestorsBusinessDaily-IBDEditorials',
      // Crypto specific feeds
      'https://cointelegraph.com/rss',
      'https://feeds.feedburner.com/CoinDesk',
      'https://decrypt.co/feed',
      // Tech and innovation feeds relevant to finance
      'https://feeds.feedburner.com/oreilly/radar',
      'https://feeds.feedburner.com/TechCrunch',
      'https://rss.cnn.com/rss/money_technology.rss'
    ];

    const allNews = [];
    
    for (const feedUrl of newsFeeds) {
      try {
        console.log(`Fetching news from: ${feedUrl}`);
        const feed = await this.parser.parseURL(feedUrl);
        
        // Process each item from the feed - take more items for better variety
        const recentItems = feed.items.slice(0, 20); // Take latest 20 items per feed
        
        for (const item of recentItems) {
          // Filter for financial/trading related content
          if (this.isFinancialContent(item.title, item.contentSnippet || item.description)) {
            allNews.push({
              title: item.title,
              url: item.link,
              description: item.contentSnippet || item.description || '',
              pubDate: item.pubDate,
              source: this.extractSourceFromUrl(feedUrl)
            });
          }
        }
        
        // Add small delay between feeds
        await new Promise(resolve => setTimeout(resolve, 500));
        
      } catch (error) {
        console.error(`Error fetching feed ${feedUrl}:`, error.message);
      }
    }

    // Sort by date and return latest 50 articles
    return allNews
      .sort((a, b) => new Date(b.pubDate) - new Date(a.pubDate))
      .slice(0, 50);
  }

  isFinancialContent(title, description) {
    const financialKeywords = [
      'stock', 'shares', 'market', 'trading', 'investment', 'forex', 'crypto', 'bitcoin',
      'ethereum', 'gold', 'oil', 'commodity', 'fund', 'portfolio', 'analyst', 'earnings',
      'revenue', 'profit', 'loss', 'fed', 'interest rate', 'inflation', 'gdp', 'economic',
      'finance', 'financial', 'bank', 'currency', 'dollar', 'euro', 'yen', 'index',
      'nasdaq', 'dow', 's&p', 'ftse', 'dax', 'nikkei', 'buy', 'sell', 'bull', 'bear',
      'rally', 'decline', 'surge', 'plunge', 'volatility', 'trend', 'support', 'resistance'
    ];

    const text = (title + ' ' + description).toLowerCase();
    return financialKeywords.some(keyword => text.includes(keyword));
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
      const prompt = this.customPrompt || `You are an expert financial analyst. Analyze the given financial news article and provide:
1. A concise summary (max 100 words) in simple language
2. The financial instrument type (stocks, forex, crypto, commodities, indices)
3. SPECIFIC instrument name (company name, ticker symbol, crypto name, etc.) - REQUIRED, no generic terms
4. Trading recommendation (BUY, SELL, or HOLD)
5. Confidence score (1-100) for the recommendation

IMPORTANT: You MUST identify a specific financial instrument (like "Apple", "AAPL", "Tesla", "Bitcoin", "EUR/USD", "S&P 500"). Do NOT use generic terms like "stocks", "crypto", "market", "economy", etc. If you cannot identify a specific instrument, return null for instrument_name.`;

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
      const systemPrompt = this.customPrompt || `You are an expert financial analyst. Analyze the given financial news article and provide:
1. A concise summary (max 100 words) in simple language
2. The financial instrument type (stocks, forex, crypto, commodities, indices)
3. SPECIFIC instrument name (company name, ticker symbol, crypto name, etc.) - REQUIRED, no generic terms
4. Trading recommendation (BUY, SELL, or HOLD)
5. Confidence score (1-100) for the recommendation

IMPORTANT: You MUST identify a specific financial instrument (like "Apple", "AAPL", "Tesla", "Bitcoin", "EUR/USD", "S&P 500"). Do NOT use generic terms like "stocks", "crypto", "market", "economy", etc. If you cannot identify a specific instrument, return null for instrument_name.

Return ONLY a JSON object with: summary, instrument_type, instrument_name, recommendation, confidence_score`;

      const response = await this.openai.chat.completions.create({
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
      'unspecified', 'unknown', 'unclear', 'tbd'
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

    // Valid specific instrument examples:
    // - Company names: "Apple", "Tesla", "Microsoft", "AAPL", "TSLA"
    // - Specific cryptos: "Solana", "Cardano", "Polygon"
    // - Specific commodities: "WTI Crude", "Brent Oil", "Natural Gas"
    // - Specific currencies: "USD/EUR", "GBP/JPY"
    // - Specific indices: "S&P 500", "NASDAQ 100", "Dow Jones"

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