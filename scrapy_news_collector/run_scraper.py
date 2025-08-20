#!/usr/bin/env python3
"""
Script principal pentru rularea scraper-ului de știri financiare
"""
import os
import sys
import logging
from scrapy.crawler import CrawlerProcess
from scrapy.utils.project import get_project_settings
from dotenv import load_dotenv

# Încarcă variabilele de mediu
load_dotenv()

def run_scrapy():
    """Rulează spider-ul Scrapy pentru colectarea știrilor"""
    
    # Configurează logging-ul
    logging.basicConfig(
        level=logging.INFO,
        format='%(asctime)s [%(name)s] %(levelname)s: %(message)s',
        handlers=[
            logging.StreamHandler(sys.stdout)
        ]
    )
    
    logger = logging.getLogger(__name__)
    logger.info("🚀 Starting financial news scraper...")
    
    # Platform AI (Node/Ollama) usage notice
    platform_url = os.getenv('PLATFORM_API_URL', 'http://localhost:8080')
    logger.info(f"🔗 Using platform AI at {platform_url} for analysis (heuristic fallback if unavailable)")
    
    # Configurează și rulează procesul Scrapy
    settings = get_project_settings()
    # Override settings at runtime from ENV for performance tuning
    # These are already read in settings.py from env, but ensure here too
    overrides = {
        'CONCURRENT_REQUESTS': int(os.getenv('SCRAPY_CONCURRENT_REQUESTS', settings.getint('CONCURRENT_REQUESTS', 16))),
        'CONCURRENT_REQUESTS_PER_DOMAIN': int(os.getenv('SCRAPY_CONCURRENT_REQUESTS_PER_DOMAIN', settings.getint('CONCURRENT_REQUESTS_PER_DOMAIN', 4))),
        'DOWNLOAD_DELAY': float(os.getenv('SCRAPY_DOWNLOAD_DELAY', settings.getfloat('DOWNLOAD_DELAY', 0.25))),
        'DOWNLOAD_TIMEOUT': int(os.getenv('SCRAPY_DOWNLOAD_TIMEOUT', settings.getint('DOWNLOAD_TIMEOUT', 30))),
        'RETRY_TIMES': int(os.getenv('SCRAPY_RETRY_TIMES', settings.getint('RETRY_TIMES', 2))),
        'DNS_TIMEOUT': int(os.getenv('SCRAPY_DNS_TIMEOUT', settings.getint('DNS_TIMEOUT', 30))),
        'AUTOTHROTTLE_ENABLED': os.getenv('SCRAPY_AUTOTHROTTLE_ENABLED', 'true').lower() in ('1','true','yes'),
        'LOG_LEVEL': os.getenv('SCRAPY_LOG_LEVEL', settings.get('LOG_LEVEL', 'INFO')),
    }
    settings.setdict(overrides, priority='cmdline')
    process = CrawlerProcess(settings)
    
    # Adaugă spider-ul de știri financiare
    process.crawl('financial_news')
    
    # Rulează procesul
    try:
        process.start()
        logger.info("✅ Scraping completed successfully!")
    except Exception as e:
        logger.error(f"❌ Scraping failed: {str(e)}")
        sys.exit(1)

def main():
    """Funcția principală"""
    print("🏦 AIInvestorHood5 - Financial News Scraper")
    print("=" * 50)
    
    # Schimbă directorul de lucru la directorul scriptului
    script_dir = os.path.dirname(os.path.abspath(__file__))
    os.chdir(script_dir)
    
    # Rulează scraper-ul
    run_scrapy()

if __name__ == '__main__':
    main()