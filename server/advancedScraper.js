const UserAgent = require('user-agents');
const axios = require('axios');
const cheerio = require('cheerio');

class AdvancedScraper {
  constructor() {
    this.browser = null;
    this.userAgents = [];
    this.requestDelays = [1000, 1500, 2000, 2500, 3000]; // Random delays
    this.initUserAgents();
  }

  initUserAgents() {
    // Generate diverse user agents
    for (let i = 0; i < 20; i++) {
      this.userAgents.push(new UserAgent().toString());
    }
  }

  getRandomUserAgent() {
    return this.userAgents[Math.floor(Math.random() * this.userAgents.length)];
  }

  getRandomDelay() {
    return this.requestDelays[Math.floor(Math.random() * this.requestDelays.length)];
  }

  // Puppeteer removed: keep Axios/Cheerio only for a lean environment

  async scrapeWithAxios(url) {
    try {
      // Random delay before request
      await new Promise(resolve => setTimeout(resolve, this.getRandomDelay()));

      const response = await axios.get(url, {
        timeout: 15000,
        headers: {
          'User-Agent': this.getRandomUserAgent(),
          'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/webp,*/*;q=0.8',
          'Accept-Language': 'en-US,en;q=0.5',
          'Accept-Encoding': 'gzip, deflate, br',
          'Connection': 'keep-alive',
          'Upgrade-Insecure-Requests': '1',
          'Sec-Fetch-Dest': 'document',
          'Sec-Fetch-Mode': 'navigate',
          'Sec-Fetch-Site': 'none',
          'Cache-Control': 'max-age=0'
        }
      });

      const $ = cheerio.load(response.data);
      
      // Remove unwanted elements
      $('script, style, nav, footer, aside, .advertisement, .ads, .ad, .social-share, .comments, .sidebar').remove();
      
      // Try multiple selectors for content
      const selectors = [
        'article [data-module="ArticleBody"]',
        '.story-body',
        '.article-content',
        '.post-content',
        '.entry-content',
        '.story-content',
        '.article-body',
        '.content-body',
        'article p',
        'main p',
        '.story p'
      ];
      
      let content = '';
      for (const selector of selectors) {
        const elements = $(selector);
        if (elements.length > 0) {
          content = elements.map((i, el) => $(el).text()).get().join(' ');
          if (content.length > 200) break;
        }
      }
      
      // Fallback to all paragraphs
      if (!content || content.length < 100) {
        content = $('p').map((i, el) => $(el).text()).get().join(' ');
      }

      return this.cleanContent(content);

    } catch (error) {
      console.error(`Axios scraping error for ${url}:`, error.message);
      return null;
    }
  }

  async scrapeContent(url, usePuppeteer = false) {
    try {
      console.log(`🕷️ Scraping: ${url.substring(0, 50)}...`);

      let content;
      
      // Axios/Cheerio scraping only
      content = await this.scrapeWithAxios(url);

      if (!content || content.length < 50) {
        throw new Error('Content too short or empty');
      }

      return content;

    } catch (error) {
      console.error(`Failed to scrape ${url}:`, error.message);
      return `Unable to fetch full content from ${url}. This appears to be a financial news article requiring further analysis.`;
    }
  }

  // No-op: Puppeteer removed
  shouldUsePuppeteer() { return false; }

  cleanContent(content) {
    if (!content) return '';
    
    return content
      .replace(/\s+/g, ' ')
      .replace(/\n+/g, ' ')
      .replace(/\t+/g, ' ')
      .trim()
      .substring(0, 3000);
  }

  async closeBrowser() {
    if (this.browser) {
      await this.browser.close();
      this.browser = null;
    }
  }

  // Rotate through different scraping strategies
  async intelligentScrape(url) {
    const strategies = [
      () => this.scrapeWithAxios(url),
      () => this.scrapeWithPuppeteer(url),
    ];

    for (const strategy of strategies) {
      try {
        const content = await strategy();
        if (content && content.length > 100) {
          return content;
        }
      } catch (error) {
        console.log(`Strategy failed for ${url}, trying next...`);
      }
    }

    return `Content extraction failed for ${url}`;
  }
}

module.exports = AdvancedScraper;