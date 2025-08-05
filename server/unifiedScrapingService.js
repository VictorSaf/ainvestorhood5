const axios = require('axios');
const cheerio = require('cheerio');
const puppeteer = require('puppeteer');
const FeedParser = require('feedparser');
const { spawn } = require('child_process');
const fs = require('fs');
const path = require('path');

class UnifiedScrapingService {
  constructor() {
    this.scrapingMethod = 'feedparser'; // Default method
    this.availableMethods = ['feedparser', 'cheerio', 'puppeteer', 'scrapy', 'beautifulsoup'];
    this.browser = null;
    this.stats = {
      feedparser: { requests: 0, successes: 0, errors: 0, avgTime: 0 },
      cheerio: { requests: 0, successes: 0, errors: 0, avgTime: 0 },
      puppeteer: { requests: 0, successes: 0, errors: 0, avgTime: 0 },
      scrapy: { requests: 0, successes: 0, errors: 0, avgTime: 0 },
      beautifulsoup: { requests: 0, successes: 0, errors: 0, avgTime: 0 }
    };
  }

  setScrapingMethod(method) {
    if (this.availableMethods.includes(method)) {
      this.scrapingMethod = method;
      console.log(`🔧 Scraping method changed to: ${method}`);
      return true;
    }
    return false;
  }

  getScrapingMethod() {
    return this.scrapingMethod;
  }

  getAvailableMethods() {
    return this.availableMethods.map(method => ({
      name: method,
      displayName: this.getDisplayName(method),
      description: this.getDescription(method),
      stats: this.stats[method]
    }));
  }

  getDisplayName(method) {
    const names = {
      feedparser: 'FeedParser',
      cheerio: 'Cheerio (jQuery)',
      puppeteer: 'Puppeteer',
      scrapy: 'Scrapy',
      beautifulsoup: 'Beautiful Soup'
    };
    return names[method] || method;
  }

  getDescription(method) {
    const descriptions = {
      feedparser: 'Fast RSS/Atom feed parsing (Node.js native)',
      cheerio: 'Server-side jQuery-like HTML parsing',
      puppeteer: 'Headless Chrome browser automation',
      scrapy: 'Professional web scraping framework (Python)',
      beautifulsoup: 'Python HTML/XML parsing library'
    };
    return descriptions[method] || 'Unknown method';
  }

  async scrapeRSSFeeds(feeds) {
    const startTime = Date.now();
    this.stats[this.scrapingMethod].requests++;

    try {
      let results = [];

      switch (this.scrapingMethod) {
        case 'feedparser':
          results = await this.scrapeWithFeedParser(feeds);
          break;
        case 'cheerio':
          results = await this.scrapeWithCheerio(feeds);
          break;
        case 'puppeteer':
          results = await this.scrapeWithPuppeteer(feeds);
          break;
        case 'scrapy':
          results = await this.scrapeWithScrapy(feeds);
          break;
        case 'beautifulsoup':
          results = await this.scrapeWithBeautifulSoup(feeds);
          break;
        default:
          throw new Error(`Unknown scraping method: ${this.scrapingMethod}`);
      }

      const duration = Date.now() - startTime;
      this.updateStats(this.scrapingMethod, duration, true);
      
      console.log(`📊 ${this.getDisplayName(this.scrapingMethod)} scraped ${results.length} articles in ${duration}ms`);
      return results;

    } catch (error) {
      const duration = Date.now() - startTime;
      this.updateStats(this.scrapingMethod, duration, false);
      console.error(`❌ ${this.getDisplayName(this.scrapingMethod)} scraping failed:`, error.message);
      throw error;
    }
  }

  async scrapeWithFeedParser(feeds) {
    const allArticles = [];
    
    for (const feed of feeds) {
      try {
        console.log(`📡 FeedParser: Processing ${feed}`);
        const response = await axios.get(feed, {
          timeout: 10000,
          headers: {
            'User-Agent': 'AIInvestorHood5-Bot/1.0'
          }
        });

        const articles = await new Promise((resolve, reject) => {
          const feedparser = new FeedParser();
          const items = [];

          feedparser.on('error', reject);
          feedparser.on('readable', function() {
            let item;
            while (item = this.read()) {
              items.push({
                title: item.title,
                url: item.link,
                pubDate: item.pubdate || item.date,
                description: item.description || item.summary
              });
            }
          });
          feedparser.on('end', () => resolve(items));

          // Parse the feed
          feedparser.write(response.data);
          feedparser.end();
        });

        allArticles.push(...articles);
        console.log(`✅ FeedParser: Got ${articles.length} articles from ${new URL(feed).hostname}`);
      } catch (error) {
        console.error(`❌ FeedParser error for ${feed}:`, error.message);
      }
    }

    return allArticles;
  }

  async scrapeWithCheerio(feeds) {
    const allArticles = [];
    
    for (const feed of feeds) {
      try {
        console.log(`📡 Cheerio: Processing ${feed}`);
        const response = await axios.get(feed, {
          timeout: 10000,
          headers: {
            'User-Agent': 'AIInvestorHood5-Bot/1.0'
          }
        });

        const $ = cheerio.load(response.data, { xmlMode: true });
        const articles = [];

        $('item').each((i, element) => {
          const title = $(element).find('title').text();
          const link = $(element).find('link').text();
          const pubDate = $(element).find('pubDate').text();
          const description = $(element).find('description').text();

          if (title && link) {
            articles.push({
              title: title.trim(),
              url: link.trim(),
              pubDate: pubDate ? new Date(pubDate) : new Date(),
              description: description.trim()
            });
          }
        });

        // Also try RSS 2.0 and Atom formats
        if (articles.length === 0) {
          $('entry').each((i, element) => {
            const title = $(element).find('title').text();
            const link = $(element).find('link').attr('href');
            const updated = $(element).find('updated').text();
            const summary = $(element).find('summary').text();

            if (title && link) {
              articles.push({
                title: title.trim(),
                url: link.trim(),
                pubDate: updated ? new Date(updated) : new Date(),
                description: summary.trim()
              });
            }
          });
        }

        allArticles.push(...articles);
        console.log(`✅ Cheerio: Got ${articles.length} articles from ${new URL(feed).hostname}`);
      } catch (error) {
        console.error(`❌ Cheerio error for ${feed}:`, error.message);
      }
    }

    return allArticles;
  }

  async scrapeWithPuppeteer(feeds) {
    const allArticles = [];
    
    if (!this.browser) {
      this.browser = await puppeteer.launch({ 
        headless: true,
        args: ['--no-sandbox', '--disable-setuid-sandbox']
      });
    }

    for (const feed of feeds) {
      try {
        console.log(`📡 Puppeteer: Processing ${feed}`);
        const page = await this.browser.newPage();
        await page.setUserAgent('AIInvestorHood5-Bot/1.0');
        
        await page.goto(feed, { 
          waitUntil: 'networkidle0',
          timeout: 15000 
        });

        const articles = await page.evaluate(() => {
          const items = [];
          
          // Try RSS item format
          const rssItems = document.querySelectorAll('item');
          rssItems.forEach(item => {
            const title = item.querySelector('title')?.textContent;
            const link = item.querySelector('link')?.textContent;
            const pubDate = item.querySelector('pubDate')?.textContent;
            const description = item.querySelector('description')?.textContent;

            if (title && link) {
              items.push({
                title: title.trim(),
                url: link.trim(),
                pubDate: pubDate ? new Date(pubDate) : new Date(),
                description: description?.trim() || ''
              });
            }
          });

          // Try Atom entry format
          if (items.length === 0) {
            const atomEntries = document.querySelectorAll('entry');
            atomEntries.forEach(entry => {
              const title = entry.querySelector('title')?.textContent;
              const link = entry.querySelector('link')?.getAttribute('href');
              const updated = entry.querySelector('updated')?.textContent;
              const summary = entry.querySelector('summary')?.textContent;

              if (title && link) {
                items.push({
                  title: title.trim(),
                  url: link.trim(),
                  pubDate: updated ? new Date(updated) : new Date(),
                  description: summary?.trim() || ''
                });
              }
            });
          }

          return items;
        });

        await page.close();
        allArticles.push(...articles);
        console.log(`✅ Puppeteer: Got ${articles.length} articles from ${new URL(feed).hostname}`);
      } catch (error) {
        console.error(`❌ Puppeteer error for ${feed}:`, error.message);
      }
    }

    return allArticles;
  }

  async scrapeWithScrapy(feeds) {
    return new Promise((resolve, reject) => {
      console.log(`📡 Scrapy: Processing ${feeds.length} feeds`);
      
      // Create temporary file with feeds
      const tempFile = path.join(__dirname, `feeds_${Date.now()}.json`);
      fs.writeFileSync(tempFile, JSON.stringify(feeds));

      const pythonScript = `
import scrapy
import json
import sys
from scrapy.crawler import CrawlerProcess
from scrapy.utils.project import get_project_settings

class FeedSpider(scrapy.Spider):
    name = 'feed_spider'
    
    def __init__(self, feeds_file=None):
        with open(feeds_file) as f:
            self.start_urls = json.load(f)
        self.articles = []
    
    def parse(self, response):
        # Parse RSS/Atom feeds
        items = response.xpath('//item')
        if not items:
            items = response.xpath('//entry')
        
        for item in items:
            title = item.xpath('.//title/text()').get()
            link = item.xpath('.//link/text()').get() or item.xpath('.//link/@href').get()
            pub_date = item.xpath('.//pubDate/text()').get() or item.xpath('.//updated/text()').get()
            description = item.xpath('.//description/text()').get() or item.xpath('.//summary/text()').get()
            
            if title and link:
                self.articles.append({
                    'title': title.strip(),
                    'url': link.strip(),
                    'pubDate': pub_date,
                    'description': description.strip() if description else ''
                })
    
    def closed(self, reason):
        print(f"SCRAPY_RESULT:{json.dumps(self.articles)}")

# Configure Scrapy settings
settings = get_project_settings()
settings.update({
    'USER_AGENT': 'AIInvestorHood5-Bot/1.0',
    'ROBOTSTXT_OBEY': False,
    'DOWNLOAD_TIMEOUT': 15,
    'LOG_LEVEL': 'ERROR'
})

process = CrawlerProcess(settings)
process.crawl(FeedSpider, feeds_file='${tempFile}')
process.start()
`;

      const scriptFile = path.join(__dirname, `scrapy_script_${Date.now()}.py`);
      fs.writeFileSync(scriptFile, pythonScript);

      // Use the virtual environment Python for Scrapy
      const pythonVenv = path.join(__dirname, '../scrapy_news_collector/venv/bin/python');
      const scrapy = spawn(pythonVenv, [scriptFile], {
        cwd: __dirname,
        stdio: ['pipe', 'pipe', 'pipe']
      });

      let stdout = '';
      let stderr = '';

      scrapy.stdout.on('data', (data) => {
        stdout += data.toString();
      });

      scrapy.stderr.on('data', (data) => {
        stderr += data.toString();
      });

      scrapy.on('close', (code) => {
        // Clean up temp files
        try {
          fs.unlinkSync(tempFile);
          fs.unlinkSync(scriptFile);
        } catch (e) {}

        if (code === 0) {
          try {
            const resultMatch = stdout.match(/SCRAPY_RESULT:(.+)/);
            if (resultMatch) {
              const articles = JSON.parse(resultMatch[1]);
              console.log(`✅ Scrapy: Got ${articles.length} articles`);
              resolve(articles);
            } else {
              resolve([]);
            }
          } catch (error) {
            console.error('❌ Scrapy result parsing error:', error.message);
            resolve([]);
          }
        } else {
          console.error(`❌ Scrapy process failed with code ${code}:`, stderr);
          resolve([]);
        }
      });

      scrapy.on('error', (error) => {
        console.error('❌ Scrapy spawn error:', error.message);
        resolve([]);
      });
    });
  }

  async scrapeWithBeautifulSoup(feeds) {
    return new Promise((resolve, reject) => {
      console.log(`📡 Beautiful Soup: Processing ${feeds.length} feeds`);
      
      const pythonScript = `
import requests
from bs4 import BeautifulSoup
import json
import sys
from datetime import datetime

feeds = ${JSON.stringify(feeds)}
all_articles = []

for feed_url in feeds:
    try:
        print(f"Processing {feed_url}", file=sys.stderr)
        response = requests.get(feed_url, timeout=10, headers={
            'User-Agent': 'AIInvestorHood5-Bot/1.0'
        })
        
        soup = BeautifulSoup(response.content, 'xml')
        articles = []
        
        # Try RSS item format
        items = soup.find_all('item')
        if not items:
            # Try Atom entry format
            items = soup.find_all('entry')
        
        for item in items:
            title_elem = item.find('title')
            link_elem = item.find('link')
            
            if not link_elem and item.name == 'entry':
                link_elem = item.find('link', href=True)
                link = link_elem.get('href') if link_elem else None
            else:
                link = link_elem.text if link_elem else None
            
            pub_date_elem = item.find(['pubDate', 'updated', 'published'])
            desc_elem = item.find(['description', 'summary', 'content'])
            
            if title_elem and link:
                articles.append({
                    'title': title_elem.text.strip(),
                    'url': link.strip(),
                    'pubDate': pub_date_elem.text if pub_date_elem else None,
                    'description': desc_elem.text.strip() if desc_elem else ''
                })
        
        all_articles.extend(articles)
        print(f"Got {len(articles)} articles from {feed_url}", file=sys.stderr)
        
    except Exception as e:
        print(f"Error processing {feed_url}: {e}", file=sys.stderr)

print(json.dumps(all_articles))
`;

      // Use the virtual environment Python for Beautiful Soup  
      const pythonVenv = path.join(__dirname, '../scrapy_news_collector/venv/bin/python');
      const beautifulSoup = spawn(pythonVenv, ['-c', pythonScript], {
        cwd: __dirname,
        stdio: ['pipe', 'pipe', 'pipe']
      });

      let stdout = '';
      let stderr = '';

      beautifulSoup.stdout.on('data', (data) => {
        stdout += data.toString();
      });

      beautifulSoup.stderr.on('data', (data) => {
        stderr += data.toString();
      });

      beautifulSoup.on('close', (code) => {
        if (code === 0) {
          try {
            const articles = JSON.parse(stdout.trim());
            console.log(`✅ Beautiful Soup: Got ${articles.length} articles`);
            resolve(articles);
          } catch (error) {
            console.error('❌ Beautiful Soup result parsing error:', error.message);
            resolve([]);
          }
        } else {
          console.error(`❌ Beautiful Soup process failed with code ${code}:`, stderr);
          resolve([]);
        }
      });

      beautifulSoup.on('error', (error) => {
        console.error('❌ Beautiful Soup spawn error:', error.message);
        resolve([]);
      });
    });
  }

  updateStats(method, duration, success) {
    const stats = this.stats[method];
    if (success) {
      stats.successes++;
    } else {
      stats.errors++;
    }
    
    // Update average time
    const totalRequests = stats.successes + stats.errors;
    if (totalRequests > 0) {
      stats.avgTime = ((stats.avgTime * (totalRequests - 1)) + duration) / totalRequests;
    }
  }

  async cleanup() {
    if (this.browser) {
      await this.browser.close();
      this.browser = null;
    }
  }

  getStats() {
    return {
      currentMethod: this.scrapingMethod,
      availableMethods: this.availableMethods,
      stats: this.stats
    };
  }
}

module.exports = UnifiedScrapingService;