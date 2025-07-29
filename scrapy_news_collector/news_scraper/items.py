import scrapy

class NewsItem(scrapy.Item):
    """Item pentru articolele de știri financiare"""
    title = scrapy.Field()
    content = scrapy.Field()
    summary = scrapy.Field()
    url = scrapy.Field()
    published_date = scrapy.Field()
    source = scrapy.Field()
    author = scrapy.Field()
    tags = scrapy.Field()
    content_hash = scrapy.Field()
    
    # Câmpuri procesate de AI
    instrument_type = scrapy.Field()
    instrument_name = scrapy.Field()
    recommendation = scrapy.Field()
    confidence_score = scrapy.Field()
    analysis = scrapy.Field()