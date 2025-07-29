import scrapy
import feedparser
from datetime import datetime
from news_scraper.items import NewsItem

class FinancialNewsSpider(scrapy.Spider):
    name = 'financial_news'
    allowed_domains = []
    
    # RSS feed-uri pentru știri financiare
    rss_feeds = [
        'https://feeds.finance.yahoo.com/rss/2.0/headline',
        'https://www.marketwatch.com/rss/topstories',
        'https://www.cnbc.com/id/100003114/device/rss/rss.html',
        'https://www.reuters.com/business/finance/rss',
        'https://www.ft.com/rss/home',
        'https://www.bloomberg.com/politics/feeds/site.xml',
        'https://www.investing.com/rss/news.rss',
        'https://seekingalpha.com/market_currents.xml',
        'https://www.zerohedge.com/fullrss2.xml',
        'https://feeds.feedburner.com/TheMotleyFool',
    ]
    
    custom_settings = {
        'DOWNLOAD_DELAY': 2,
        'CONCURRENT_REQUESTS': 4,
        'ROBOTSTXT_OBEY': False,
    }
    
    def start_requests(self):
        """Generează request-uri pentru RSS feed-uri"""
        for feed_url in self.rss_feeds:
            yield scrapy.Request(
                url=feed_url,
                callback=self.parse_rss_feed,
                meta={'feed_url': feed_url},
                dont_filter=True
            )
    
    def parse_rss_feed(self, response):
        """Parsează RSS feed-ul și extrage URL-urile articolelor"""
        feed_url = response.meta['feed_url']
        
        try:
            # Parsează RSS cu feedparser
            feed = feedparser.parse(response.text)
            
            self.logger.info(f"📡 Processing RSS feed: {feed_url}")
            self.logger.info(f"📰 Found {len(feed.entries)} articles in feed")
            
            for entry in feed.entries[:10]:  # Limitează la primele 10 articole
                # Creează item-ul de bază din RSS
                item = NewsItem()
                item['title'] = entry.get('title', 'No title')
                item['url'] = entry.get('link', '')
                item['source'] = feed.get('feed', {}).get('title', 'Unknown')
                item['author'] = entry.get('author', '')
                
                # Procesează data publicării
                published_date = entry.get('published_parsed') or entry.get('updated_parsed')
                if published_date:
                    item['published_date'] = datetime(*published_date[:6]).isoformat()
                else:
                    item['published_date'] = datetime.now().isoformat()
                
                # Extrage conținutul din RSS (summary)
                content = entry.get('summary', '') or entry.get('description', '')
                item['content'] = self.clean_html(content)
                
                # Extrage tag-urile
                tags = []
                if hasattr(entry, 'tags'):
                    tags = [tag.term for tag in entry.tags]
                item['tags'] = tags
                
                # Dacă articolul are un URL valid, încearcă să extragi mai mult conținut
                if item['url'] and item['url'].startswith('http'):
                    yield scrapy.Request(
                        url=item['url'],
                        callback=self.parse_article,
                        meta={'item': item},
                        dont_filter=True,
                        errback=self.handle_error
                    )
                else:
                    # Dacă nu are URL valid, procesează doar cu datele din RSS
                    yield item
                    
        except Exception as e:
            self.logger.error(f"❌ Error parsing RSS feed {feed_url}: {str(e)}")
    
    def parse_article(self, response):
        """Parsează articolul individual pentru mai mult conținut"""
        item = response.meta['item']
        
        try:
            # Încearcă să extragi mai mult conținut din pagina articolului
            # Selectoare generice pentru conținut
            content_selectors = [
                '.article-body::text',
                '.story-body::text',
                '.entry-content::text',
                '.post-content::text',
                '.content::text',
                'article p::text',
                '.article p::text',
                '.story p::text',
                'p::text'
            ]
            
            additional_content = []
            for selector in content_selectors:
                content_parts = response.css(selector).getall()
                if content_parts and len(content_parts) > 2:  # Dacă găsește conținut substanțial
                    additional_content = content_parts
                    break
            
            if additional_content:
                # Combinează conținutul extras cu cel din RSS
                full_content = ' '.join(additional_content[:10])  # Primele 10 paragrafe
                item['content'] = self.clean_html(full_content)
                self.logger.info(f"✅ Enhanced content for: {item['title'][:50]}...")
            else:
                self.logger.info(f"📄 Using RSS content for: {item['title'][:50]}...")
            
            yield item
            
        except Exception as e:
            self.logger.error(f"❌ Error parsing article {response.url}: {str(e)}")
            # Returnează item-ul cu conținutul din RSS
            yield item
    
    def handle_error(self, failure):
        """Gestionează erorile de scraping"""
        self.logger.error(f"❌ Request failed: {failure.request.url}")
        # Încearcă să salveze item-ul cu datele disponibile din RSS
        if 'item' in failure.request.meta:
            yield failure.request.meta['item']
    
    def clean_html(self, text):
        """Curăță textul de tag-uri HTML și caractere speciale"""
        if not text:
            return ''
        
        # Înlătură tag-urile HTML simple
        import re
        text = re.sub(r'<[^>]+>', '', text)
        
        # Înlătură caractere speciale și spații multiple
        text = re.sub(r'\s+', ' ', text)
        text = text.replace('&nbsp;', ' ')
        text = text.replace('&amp;', '&')
        text = text.replace('&lt;', '<')
        text = text.replace('&gt;', '>')
        text = text.replace('&quot;', '"')
        
        return text.strip()[:2000]  # Limitează la 2000 caractere