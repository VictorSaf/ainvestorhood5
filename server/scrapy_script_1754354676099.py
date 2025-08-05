
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
process.crawl(FeedSpider, feeds_file='/Volumes/external/work/ainvestorhood5/server/feeds_1754354676098.json')
process.start()
