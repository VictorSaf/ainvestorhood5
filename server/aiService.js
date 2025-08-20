const OpenAI = require('openai');
const axios = require('axios');
const cheerio = require('cheerio');
const crypto = require('crypto');
const Parser = require('rss-parser');
const AdvancedScraper = require('./advancedScraper');
const OllamaService = require('./ollamaService');

class AIService {
  constructor(apiKey, aiProvider = 'openai', ollamaModel = null, customPrompt = null) {
    this.aiProvider = aiProvider;
    this.customPrompt = customPrompt;
    
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

  // Normalize instrument type into one of: stocks, forex, crypto, commodities, indices
  normalizeInstrumentType(rawType, title = '') {
    const text = `${rawType || ''} ${title || ''}`.toLowerCase();

    // Strong stock signals: exchange:ticker or ticker in parentheses
    const hasExchangeTicker = /(nasdaq|nyse|amex|tsx|lse|sehk)\s*[:\-]\s*[a-z]{1,6}/i.test(text);
    const hasParenTicker = /\(([A-Z]{1,6})\)/.test(title);
    if (hasExchangeTicker || hasParenTicker) return 'stocks';

    if ((rawType || '').toLowerCase() === 'stocks') return 'stocks';
    if (/(crypto|bitcoin|ethereum|btc|eth|solana|token|blockchain)/.test(text)) return 'crypto';
    if (/(forex|fx|currency|usd|eur|jpy|gbp|aud|cad|chf|cny|yen|euro|dollar)/.test(text)) return 'forex';
    if (/(commodity|commodities|gold|oil|brent|wti|silver|copper|corn|wheat|soy)/.test(text)) return 'commodities';

    // Indices: avoid matching exchange mentions like "NASDAQ:AMD"
    if (/(s&p|sp-?500|nasdaq(\s+100|\s+composite)?(?!\s*:\s*[a-z]{1,6})|dow|ftse|dax|nikkei|tsx\s*composite|cac|hang\s*seng)/i.test(text)) {
      return 'indices';
    }
    return 'stocks';
  }

  normalizeAnalysis(analysis, title) {
    const rawConfidence = parseInt(analysis.confidence_score);
    const normalized = {
      summary: analysis.summary || `Analysis of: ${title.substring(0, 100)}...`,
      instrument_type: this.normalizeInstrumentType(analysis.instrument_type, title),
      instrument_name: analysis.instrument_name || null,
      recommendation: ['BUY', 'SELL', 'HOLD'].includes(analysis.recommendation) ? analysis.recommendation : 'HOLD',
      confidence_score: Math.max(1, Math.min(100, Number.isFinite(rawConfidence) ? rawConfidence : this.heuristicConfidence(title)))
    };
    // If instrument name is missing, try to extract deterministically from title
    if (!normalized.instrument_name) {
      const inferred = this.extractInstrumentNameFromText(title, normalized.instrument_type);
      if (inferred) normalized.instrument_name = inferred;
    }
    return normalized;
  }

  heuristicConfidence(title) {
    // Simple heuristic: longer, specific titles yield higher confidence
    const len = (title || '').length;
    let base = 60;
    if (len < 50) base = 55;
    if (len > 120) base = 70;
    // Boost if strong instrument cues exist
    if (/(NASDAQ|NYSE|\([A-Z]{1,6}\)|BTC|ETH|EUR\/USD|GOLD|WTI|S&P|DAX)/i.test(title || '')) {
      base += 10;
    }
    return Math.max(45, Math.min(85, base));
  }

  extractInstrumentNameFromText(text, instrumentType) {
    if (!text) return null;
    const t = (instrumentType || '').toLowerCase();
    // Stocks
    if (t === 'stocks') {
      const ex = /(nasdaq|nyse|amex|tsx|lse|sehk)\s*[:\-]\s*([A-Z]{1,6})/i.exec(text);
      if (ex) return ex[2].toUpperCase();
      const par = /\(([A-Z]{1,6})\)/.exec(text);
      if (par) return par[1].toUpperCase();
      const up = /\b([A-Z]{1,6})\b(?![^\(]*\))/g;
      let m; const candidates = new Set();
      while ((m = up.exec(text)) !== null) {
        candidates.add(m[1]);
      }
      // Heuristic: prefer 3-5 letter symbols
      const sorted = [...candidates].sort((a,b)=>Math.abs(a.length-4)-Math.abs(b.length-4));
      if (sorted.length) return sorted[0];
    }
    // Forex
    if (t === 'forex') {
      const pair = /\b([A-Z]{3})\/?([A-Z]{3})\b/.exec(text);
      if (pair) return `${pair[1].toUpperCase()}/${pair[2].toUpperCase()}`;
    }
    // Crypto
    if (t === 'crypto') {
      const sym = /\b(BTC|ETH|SOL|ADA|XRP|DOGE|USDT|USDC|BNB)\b/i.exec(text);
      if (sym) return sym[1].toUpperCase();
      const ds = /\$(btc|eth|sol|ada|xrp|doge)/i.exec(text);
      if (ds) return ds[1].toUpperCase();
      const name = /(bitcoin|ethereum|solana|cardano|ripple|dogecoin)/i.exec(text);
      if (name) {
        const map = { bitcoin:'BTC', ethereum:'ETH', solana:'SOL', cardano:'ADA', ripple:'XRP', dogecoin:'DOGE' };
        return map[name[1].toLowerCase()];
      }
    }
    // Commodities
    if (t === 'commodities') {
      const comm = /(gold|silver|brent|wti|oil|copper|corn|wheat|soy|natural gas)/i.exec(text);
      if (comm) {
        const cap = comm[1].toLowerCase().replace(/\b\w/g, c => c.toUpperCase());
        return cap;
      }
    }
    // Indices
    if (t === 'indices') {
      const idx = /(s&p\s*500|sp-?500|nasdaq\s*100|nasdaq\s*composite|dow\s*jones|ftse\s*100|dax|nikkei\s*225|cac\s*40|hang\s*seng)/i.exec(text);
      if (idx) return idx[1].toUpperCase();
    }
    return null;
  }

  async searchFinancialNews() {
    const newsFeeds = [
      // Markets/General
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
      // Stocks
      'https://www.zacks.com/stock/research/feed',
      'https://www.fool.com/a/feeds/foolwatch.xml',
      // Crypto
      'https://www.coindesk.com/arc/outboundfeeds/rss/',
      'https://cointelegraph.com/rss',
      'https://www.theblock.co/rss',
      // Forex/Macro
      'https://www.dailyfx.com/feeds/market-news',
      'https://www.fxstreet.com/rss',
      // Commodities
      'https://www.oilprice.com/rss/main.xml',
      'https://www.kitco.com/rss/feed.xml',
      // Indices/Economy
      'https://www.wsj.com/xml/rss/3_7031.xml',
      'https://www.economist.com/finance-and-economics/rss.xml',
      // Tech/AI impacting markets
      'https://www.semianalysis.com/feed',
      'https://www.techmeme.com/feed.xml'
    ];

    const allNews = [];
    
    for (const feedUrl of newsFeeds) {
      try {
        console.log(`Fetching news from: ${feedUrl}`);
        const feed = await this.parser.parseURL(feedUrl);
        
        // Process more items per feed for higher coverage
        const recentItems = feed.items.slice(0, 50); // latest 50 items per feed
        
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

    // Sort by date and return latest 200 articles
    return allNews
      .sort((a, b) => new Date(b.pubDate) - new Date(a.pubDate))
      .slice(0, 200);
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
3. Specific instrument name if mentioned
4. Trading recommendation (BUY, SELL, or HOLD)
5. Confidence score (1-100) for the recommendation`;

      const raw = await this.ollama.analyzeNewsWithOllama(this.ollamaModel, prompt, title, content, url);
      return this.normalizeAnalysis(raw || {}, title);
    } catch (error) {
      console.error('Error analyzing with Ollama:', error);
      return this.getDefaultAnalysis(title);
    }
  }

  async analyzeWithOpenAI(title, content, url) {
    try {
      const systemPrompt = this.customPrompt || `You are an expert financial analyst. Analyze the given news article and provide:
1. A concise summary (max 100 words) in simple language
2. The financial instrument type (stocks, forex, crypto, commodities, indices)
3. Specific instrument name if mentioned
4. Trading recommendation (BUY, SELL, or HOLD)
5. Confidence score (1-100) for the recommendation

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
        max_tokens: 300,
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
    return this.normalizeAnalysis(analysis || {}, title);
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
        max_tokens: 50,
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
        max_tokens: 500,
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