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
    
    # Verifică dacă API key-ul OpenAI este disponibil
    api_key = os.getenv('OPENAI_API_KEY')
    if not api_key:
        logger.warning("⚠️  OpenAI API key not found. AI analysis will be skipped.")
    else:
        logger.info("✅ OpenAI API key found. AI analysis enabled.")
    
    # Configurează și rulează procesul Scrapy
    settings = get_project_settings()
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