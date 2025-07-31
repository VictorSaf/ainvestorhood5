#!/usr/bin/env python3
"""
Simple News Collector for AIInvestorHood5
Colectează știri din RSS feeds și le salvează în baza de date
"""

import sqlite3
import requests
import feedparser
import hashlib
from datetime import datetime
import time

# RSS Feeds (doar cele care funcționează)
RSS_FEEDS = [
    'https://www.marketwatch.com/rss/topstories',
    'https://www.investing.com/rss/news.rss',
    'https://www.cnbc.com/id/100003114/device/rss/rss.html',
    'https://feeds.feedburner.com/TheMotleyFool',
]

# Database path
DB_PATH = '/app/data/ainvestorhood.db'

def create_content_hash(title, url):
    """Create a unique hash for content deduplication"""
    content = f"{title}{url}"
    return hashlib.md5(content.encode()).hexdigest()

def fetch_rss_articles(feed_url, max_articles=5):
    """Fetch articles from RSS feed"""
    try:
        print(f"📡 Fetching from {feed_url}...")
        headers = {
            'User-Agent': 'AIInvestorHood5-NewsBot/1.0 (Financial News Aggregator)'
        }
        
        response = requests.get(feed_url, headers=headers, timeout=15)
        
        if response.status_code != 200:
            print(f"   ❌ HTTP {response.status_code}")
            return []
            
        feed = feedparser.parse(response.content)
        articles = []
        
        for entry in feed.entries[:max_articles]:
            try:
                article = {
                    'title': entry.title,
                    'summary': entry.get('summary', entry.title)[:300],  # Limit summary length
                    'url': entry.link,
                    'published': datetime.now().isoformat(),
                    'content_hash': create_content_hash(entry.title, entry.link)
                }
                articles.append(article)
            except Exception as e:
                print(f"   ⚠️  Error parsing entry: {e}")
                continue
                
        print(f"   ✅ Found {len(articles)} articles")
        return articles
        
    except Exception as e:
        print(f"   ❌ Error fetching {feed_url}: {e}")
        return []

def save_articles_to_db(articles):
    """Save articles to database"""
    if not articles:
        return 0
        
    conn = sqlite3.connect(DB_PATH)
    cursor = conn.cursor()
    
    saved_count = 0
    
    for article in articles:
        try:
            cursor.execute("""
                INSERT INTO news_articles 
                (title, summary, instrument_type, instrument_name, 
                 recommendation, confidence_score, source_url, content_hash, published_at)
                VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
            """, (
                article['title'],
                article['summary'],
                'stocks',  # Default to stocks
                None,      # No specific instrument
                'HOLD',    # Default recommendation
                50,        # Default confidence
                article['url'],
                article['content_hash'],
                article['published']
            ))
            saved_count += 1
            print(f"   ✅ Saved: {article['title'][:60]}...")
            
        except sqlite3.IntegrityError:
            print(f"   ⚠️  Duplicate: {article['title'][:60]}...")
        except Exception as e:
            print(f"   ❌ Error saving: {e}")
    
    conn.commit()
    conn.close()
    
    return saved_count

def main():
    """Main collection function"""
    print("🏦 AIInvestorHood5 - Simple News Collector")
    print("=" * 50)
    print(f"📅 Starting collection at {datetime.now()}")
    
    total_saved = 0
    
    for feed_url in RSS_FEEDS:
        articles = fetch_rss_articles(feed_url, max_articles=3)
        saved = save_articles_to_db(articles)
        total_saved += saved
        
        if feed_url != RSS_FEEDS[-1]:  # Don't sleep after last feed
            time.sleep(2)  # Be respectful
    
    print(f"\n📊 Collection complete!")
    print(f"   Total articles saved: {total_saved}")
    
    # Show current database stats
    conn = sqlite3.connect(DB_PATH)
    cursor = conn.cursor()
    cursor.execute("SELECT COUNT(*) FROM news_articles")
    total_count = cursor.fetchone()[0]
    conn.close()
    
    print(f"   Total articles in database: {total_count}")

if __name__ == "__main__":
    main()