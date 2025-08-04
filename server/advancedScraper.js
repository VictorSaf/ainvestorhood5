const puppeteer = require('puppeteer');
const UserAgent = require('user-agents');
const axios = require('axios');
const cheerio = require('cheerio');

class AdvancedScraper {
  constructor() {
    this.browser = null;
    this.userAgents = [];
    this.requestDelays = [200, 300, 500, 800, 1000]; // Reduced random delays for faster processing
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

  async initBrowser() {
    if (this.browser) return this.browser;

    this.browser = await puppeteer.launch({
      headless: 'new',
      args: [
        '--no-sandbox',
        '--disable-setuid-sandbox',
        '--disable-dev-shm-usage',
        '--disable-accelerated-2d-canvas',
        '--no-first-run',
        '--no-zygote',
        '--disable-gpu',
        '--disable-web-security',
        '--disable-features=VizDisplayCompositor'
      ]
    });

    return this.browser;
  }

  async scrapeWithPuppeteer(url, selectors = []) {
    try {
      const browser = await this.initBrowser();
      const page = await browser.newPage();

      // Set random user agent
      await page.setUserAgent(this.getRandomUserAgent());

      // Set viewport to mimic real browser
      await page.setViewport({
        width: 1366 + Math.floor(Math.random() * 200),
        height: 768 + Math.floor(Math.random() * 200)
      });

      // Block images and CSS to speed up loading
      await page.setRequestInterception(true);
      page.on('request', (req) => {
        const resourceType = req.resourceType();
        if (resourceType === 'image' || resourceType === 'stylesheet' || resourceType === 'font') {
          req.abort();
        } else {
          req.continue();
        }
      });

      // Navigate with timeout
      await page.goto(url, { 
        waitUntil: 'domcontentloaded',
        timeout: 30000 
      });

      // Wait for content to load
      await page.waitForTimeout(Math.random() * 2000 + 1000);

      // Try to find article content using multiple selectors
      let content = '';
      const contentSelectors = selectors.length > 0 ? selectors : [
        'article',
        '[data-module="ArticleBody"]',
        '.story-body',
        '.article-content',
        '.post-content',
        '.entry-content',
        '.content-body',
        'main p',
        '.story p',
        'p'
      ];

      for (const selector of contentSelectors) {
        try {
          const elements = await page.$$(selector);
          if (elements.length > 0) {
            content = await page.evaluate((sel) => {
              const elements = document.querySelectorAll(sel);
              return Array.from(elements).map(el => el.textContent).join(' ');
            }, selector);

            if (content.length > 200) break;
          }
        } catch (e) {
          // Continue to next selector
        }
      }

      await page.close();
      return this.cleanContent(content);

    } catch (error) {
      console.error(`Puppeteer scraping error for ${url}:`, error.message);
      return null;
    }
  }

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
      
      // Try Puppeteer for JavaScript-heavy sites
      if (usePuppeteer || this.shouldUsePuppeteer(url)) {
        content = await this.scrapeWithPuppeteer(url);
      }
      
      // Fallback to Axios if Puppeteer fails or not needed
      if (!content) {
        content = await this.scrapeWithAxios(url);
      }

      if (!content || content.length < 50) {
        throw new Error('Content too short or empty');
      }

      return content;

    } catch (error) {
      console.error(`Failed to scrape ${url}:`, error.message);
      return `Unable to fetch full content from ${url}. This appears to be a financial news article requiring further analysis.`;
    }
  }

  shouldUsePuppeteer(url) {
    // Use Puppeteer for sites that heavily rely on JavaScript
    const jsHeavySites = [
      'bloomberg.com',
      'marketwatch.com',
      'nasdaq.com',
      'cnbc.com'
    ];
    
    return jsHeavySites.some(site => url.includes(site));
  }

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
    // Add timeout wrapper for entire scraping process
    const timeoutPromise = new Promise((_, reject) => 
      setTimeout(() => reject(new Error('Scraping timeout')), 15000) // 15 second total timeout
    );
    
    try {
      return await Promise.race([
        this.attemptScraping(url),
        timeoutPromise
      ]);
    } catch (error) {
      console.log(`❌ Scraping failed for ${url}: ${error.message}`);
      return `Content extraction failed for ${url}`;
    }
  }

  async attemptScraping(url) {
    const strategies = [
      () => this.scrapeWithAxios(url),
      () => this.scrapeWithPuppeteer(url),
    ];

    for (const strategy of strategies) {
      try {
        const content = await strategy();
        if (content && content.length > 100) {
          console.log(`✅ Scraped ${content.length} chars from ${url}`);
          return content;
        }
      } catch (error) {
        console.log(`Strategy failed for ${url}, trying next...`);
      }
    }

    throw new Error('All scraping strategies failed');
  }
}

module.exports = AdvancedScraper;