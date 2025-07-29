import hashlib
import sqlite3
import os
import sys
import json
from datetime import datetime
from openai import OpenAI
from dotenv import load_dotenv

# Încarcă variabilele de mediu
load_dotenv()

class DuplicatesPipeline:
    """Pipeline pentru eliminarea duplicatelor"""
    
    def __init__(self):
        self.seen_hashes = set()

    def process_item(self, item, spider):
        # Generează hash pentru conținut
        content_text = f"{item.get('title', '')}{item.get('content', '')}"
        content_hash = hashlib.md5(content_text.encode('utf-8')).hexdigest()
        item['content_hash'] = content_hash
        
        if content_hash in self.seen_hashes:
            spider.logger.info(f"Articol duplicat detectat: {item.get('title', 'No title')[:50]}...")
            return None
        
        self.seen_hashes.add(content_hash)
        return item

class AIAnalysisPipeline:
    """Pipeline pentru analiza AI a articolelor"""
    
    def __init__(self):
        self.client = None
        api_key = os.getenv('OPENAI_API_KEY')
        if api_key:
            self.client = OpenAI(api_key=api_key)
    
    def process_item(self, item, spider):
        if not self.client:
            spider.logger.warning("OpenAI API key not found, skipping AI analysis")
            # Setează valori default
            item['instrument_type'] = 'General'
            item['instrument_name'] = ''
            item['recommendation'] = 'HOLD'
            item['confidence_score'] = 50
            item['analysis'] = 'AI analysis not available'
            return item
        
        try:
            # Pregătește textul pentru analiză
            text_to_analyze = f"Title: {item.get('title', '')}\n\nContent: {item.get('content', '')[:2000]}"
            
            # Prompt pentru analiza financiară
            system_prompt = """You are a financial analyst AI. Analyze the given financial news article and provide:

1. instrument_type: One of [Stocks, Forex, Crypto, Commodities, Indices, Bonds]
2. instrument_name: Specific instrument mentioned (e.g., "AAPL", "EUR/USD", "Bitcoin", "Gold", "S&P 500")
3. recommendation: One of [BUY, SELL, HOLD]
4. confidence_score: Integer from 1-100 indicating confidence in recommendation
5. analysis: Brief 1-2 sentence summary of why this recommendation

Response format: JSON only
{
  "instrument_type": "...",
  "instrument_name": "...",
  "recommendation": "...",
  "confidence_score": 75,
  "analysis": "..."
}"""

            response = self.client.chat.completions.create(
                model="gpt-4o-mini",
                messages=[
                    {"role": "system", "content": system_prompt},
                    {"role": "user", "content": text_to_analyze}
                ],
                max_tokens=300,
                temperature=0.3
            )
            
            # Parsează răspunsul JSON
            analysis_result = json.loads(response.choices[0].message.content)
            
            # Actualizează item-ul cu rezultatele analizei
            item['instrument_type'] = analysis_result.get('instrument_type', 'General')
            item['instrument_name'] = analysis_result.get('instrument_name', '')
            item['recommendation'] = analysis_result.get('recommendation', 'HOLD')
            item['confidence_score'] = int(analysis_result.get('confidence_score', 50))
            item['analysis'] = analysis_result.get('analysis', '')
            
            spider.logger.info(f"AI analysis completed for: {item.get('title', '')[:50]}...")
            
        except Exception as e:
            spider.logger.error(f"AI analysis failed: {str(e)}")
            # Valori default în caz de eroare
            item['instrument_type'] = 'General'
            item['instrument_name'] = ''
            item['recommendation'] = 'HOLD'
            item['confidence_score'] = 50
            item['analysis'] = f'Analysis failed: {str(e)}'
        
        return item

class DatabasePipeline:
    """Pipeline pentru salvarea în baza de date SQLite"""
    
    def __init__(self):
        self.connection = None
        self.db_path = None
    
    def open_spider(self, spider):
        # Găsește baza de date existentă
        current_dir = os.path.dirname(os.path.abspath(__file__))
        project_root = os.path.join(current_dir, '..', '..', '..')
        self.db_path = os.path.join(project_root, 'server', 'ainvestorhood.db')
        
        spider.logger.info(f"Connecting to database: {self.db_path}")
        
        # Conectează la baza de date
        self.connection = sqlite3.connect(self.db_path, check_same_thread=False)
        self.connection.execute('PRAGMA journal_mode=WAL')  # Pentru concurrency
        
    def close_spider(self, spider):
        if self.connection:
            self.connection.close()
    
    def process_item(self, item, spider):
        try:
            # Verifică dacă articolul există deja
            cursor = self.connection.cursor()
            cursor.execute(
                "SELECT id FROM news_articles WHERE content_hash = ?",
                (item['content_hash'],)
            )
            
            if cursor.fetchone():
                spider.logger.info(f"Article already exists in database: {item.get('title', '')[:50]}...")
                return item
            
            # Inserează articolul nou
            published_at = item.get('published_date')
            if published_at:
                # Convertește la format ISO dacă este necesar
                if isinstance(published_at, str):
                    try:
                        # Încearcă să parseze data
                        from datetime import datetime
                        import dateutil.parser
                        parsed_date = dateutil.parser.parse(published_at)
                        published_at = parsed_date.isoformat()
                    except:
                        published_at = datetime.now().isoformat()
                else:
                    published_at = datetime.now().isoformat()
            else:
                published_at = datetime.now().isoformat()
            
            cursor.execute("""
                INSERT INTO news_articles 
                (title, summary, instrument_type, instrument_name, recommendation, 
                 confidence_score, source_url, content_hash, published_at)
                VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
            """, (
                item.get('title', ''),
                item.get('analysis', item.get('content', '')[:500]),  # Folosește analiza ca summary
                item.get('instrument_type', 'General'),
                item.get('instrument_name', ''),
                item.get('recommendation', 'HOLD'),
                item.get('confidence_score', 50),
                item.get('url', ''),
                item.get('content_hash', ''),
                published_at
            ))
            
            self.connection.commit()
            spider.logger.info(f"✅ Article saved to database: {item.get('title', '')[:50]}...")
            
        except Exception as e:
            spider.logger.error(f"❌ Database error: {str(e)}")
            self.connection.rollback()
        
        return item