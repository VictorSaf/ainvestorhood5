import os

BOT_NAME = 'news_scraper'

SPIDER_MODULES = ['news_scraper.spiders']
NEWSPIDER_MODULE = 'news_scraper.spiders'

# Respectă robots.txt
ROBOTSTXT_OBEY = False

# Configurații pentru evitarea detectării
USER_AGENT = 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36'

# Randomizare user agents
DOWNLOADER_MIDDLEWARES = {
    'scrapy.downloadermiddlewares.useragent.UserAgentMiddleware': None,
    'scrapy_user_agents.middlewares.RandomUserAgentMiddleware': 400,
    'news_scraper.middlewares.NewsScraperDownloaderMiddleware': 543,
}

# Pipeline pentru procesarea datelor
ITEM_PIPELINES = {
    'news_scraper.pipelines.DuplicatesPipeline': 200,
    'news_scraper.pipelines.AIAnalysisPipeline': 300,
    'news_scraper.pipelines.DatabasePipeline': 400,
}

# Configurații pentru respectful scraping (overridable via ENV for performance)
DOWNLOAD_DELAY = float(os.getenv('SCRAPY_DOWNLOAD_DELAY', '0.25'))
RANDOMIZE_DOWNLOAD_DELAY = True
CONCURRENT_REQUESTS = int(os.getenv('SCRAPY_CONCURRENT_REQUESTS', '16'))
CONCURRENT_REQUESTS_PER_DOMAIN = int(os.getenv('SCRAPY_CONCURRENT_REQUESTS_PER_DOMAIN', '4'))

# Cache pentru dezvoltare
HTTPCACHE_ENABLED = False
HTTPCACHE_EXPIRATION_SECS = 3600

# Logs
LOG_LEVEL = os.getenv('SCRAPY_LOG_LEVEL', 'INFO')
LOG_FORMAT = '%(levelname)s: %(message)s'

# Timeout-uri
DOWNLOAD_TIMEOUT = int(os.getenv('SCRAPY_DOWNLOAD_TIMEOUT', '45'))
RETRY_TIMES = int(os.getenv('SCRAPY_RETRY_TIMES', '3'))
DNS_TIMEOUT = int(os.getenv('SCRAPY_DNS_TIMEOUT', '30'))

# AutoThrottle pentru ajustarea automată a delay-ului
AUTOTHROTTLE_ENABLED = os.getenv('SCRAPY_AUTOTHROTTLE_ENABLED', 'true').lower() in ('1','true','yes')
AUTOTHROTTLE_START_DELAY = 0.25
AUTOTHROTTLE_MAX_DELAY = 5
AUTOTHROTTLE_TARGET_CONCURRENCY = 4.0

# Headers pentru a părea mai natural
DEFAULT_REQUEST_HEADERS = {
    'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
    'Accept-Language': 'en-US,en;q=0.5',
    'Accept-Encoding': 'gzip, deflate',
    'DNT': '1',
    'Connection': 'keep-alive',
    'Upgrade-Insecure-Requests': '1',
}