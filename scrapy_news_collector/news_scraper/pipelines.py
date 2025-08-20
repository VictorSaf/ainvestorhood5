import hashlib
import sqlite3
import os
import sys
import json
import requests
from datetime import datetime
import requests
from dotenv import load_dotenv

# Încarcă variabilele de mediu
load_dotenv()

class DuplicatesPipeline:
    """Pipeline pentru eliminarea duplicatelor"""
    
    def __init__(self):
        self.seen_hashes = set()

    def normalize_title(self, text: str) -> str:
        text = (text or '').lower()
        import re
        text = re.sub(r'[^a-z0-9\s]', ' ', text)
        text = re.sub(r'\s+', ' ', text).strip()
        return text

    def process_item(self, item, spider):
        # Generează hash pentru conținut (preferă URL-ul ca identificator stabil)
        url = (item.get('url') or '').strip()
        if url:
            base = url
        else:
            base = f"{item.get('title','')}{item.get('content','')}"
        content_hash = hashlib.md5(base.encode('utf-8')).hexdigest()
        item['content_hash'] = content_hash
        
        if content_hash in self.seen_hashes:
            spider.logger.info(f"Articol duplicat detectat: {item.get('title', 'No title')[:50]}...")
            return None
        
        self.seen_hashes.add(content_hash)

        # Soft duplicate check by normalized title similarity
        fp_now = self.normalize_title(item.get('title', ''))
        for fp in list(self.seen_hashes)[:2000]:
            # quick token overlap using set Jaccard
            try:
                a = set(fp_now.split())
                b = set(fp.split())
                if a and b:
                    j = len(a & b) / len(a | b)
                    if j >= 0.8:
                        spider.logger.info("Articol probabil duplicat (titlu similar)")
                        return None
            except Exception:
                pass
        return item

class AIAnalysisPipeline:
    """Pipeline pentru analiza AI a articolelor"""
    
    def __init__(self):
        self.client = None
        self.ai_provider = None
        self.ollama_model = None
        self.ollama_url = 'http://localhost:11434'
        
        # Citește configurația din baza de date
        self._load_ai_config()
    
    def _load_ai_config(self):
        """Încarcă configurația AI din baza de date"""
        try:
            # Calea către baza de date
            current_dir = os.path.dirname(os.path.abspath(__file__))
            project_root = os.path.join(current_dir, '..', '..')
            db_path = os.path.join(project_root, 'server', 'ainvestorhood.db')
            
            conn = sqlite3.connect(db_path)
            cursor = conn.cursor()
            
            # Citește AI provider
            cursor.execute("SELECT value FROM settings WHERE key = 'ai_provider'")
            result = cursor.fetchone()
            self.ai_provider = result[0] if result else 'openai'
            
            if self.ai_provider.lower() == 'openai':
                # Pentru OpenAI - citește cheia API
                api_key = os.getenv('OPENAI_API_KEY')
                if api_key:
                    self.client = OpenAI(api_key=api_key)
            elif self.ai_provider == 'ollama':
                # Pentru Ollama - citește modelul
                cursor.execute("SELECT value FROM settings WHERE key = 'ollama_model'")
                result = cursor.fetchone()
                self.ollama_model = result[0] if result else 'llama3:latest'
                
            conn.close()
        except Exception as e:
            print(f"Error loading AI config: {e}")
            # Fallback la OpenAI din .env
            api_key = os.getenv('OPENAI_API_KEY')
            if api_key:
                self.client = OpenAI(api_key=api_key)
                self.ai_provider = 'openai'
    
    def _parse_ollama_response(self, content):
        """Fallback pentru parsing manual al răspunsului Ollama"""
        try:
            # Valori default
            result = {
                'instrument_type': 'General',
                'instrument_name': '',
                'recommendation': 'HOLD',
                'confidence_score': 50,
                'analysis': content[:200] if content else 'Analysis not available'
            }
            
            # Încearcă să găsească patterns în text
            import re
            
            # Caută recommendation
            rec_match = re.search(r'"recommendation":\s*"([^"]+)"', content, re.IGNORECASE)
            if rec_match:
                result['recommendation'] = rec_match.group(1).upper()
            
            # Caută confidence score
            conf_match = re.search(r'"confidence_score":\s*(\d+)', content)
            if conf_match:
                result['confidence_score'] = int(conf_match.group(1))
            
            # Caută instrument type
            inst_match = re.search(r'"instrument_type":\s*"([^"]+)"', content, re.IGNORECASE)
            if inst_match:
                result['instrument_type'] = inst_match.group(1)
            
            return result
        except Exception:
            return {
                'instrument_type': 'General',
                'instrument_name': '',
                'recommendation': 'HOLD', 
                'confidence_score': 50,
                'analysis': 'Analysis parsing failed'
            }
    
    def is_tradable(self, instrument_type: str, instrument_name: str, title: str) -> bool:
        t = (instrument_type or '').lower()
        name = (instrument_name or '').strip()
        text = f"{name} {title}"
        import re
        if not name:
            return False
        if t == 'stocks':
            return bool(re.search(r"\(([A-Z]{1,6})\)", text) or re.search(r"\b[A-Z]{1,6}\b", name))
        if t == 'forex':
            return bool(re.search(r"\b([A-Z]{3})/?([A-Z]{3})\b", text))
        if t == 'crypto':
            return bool(re.search(r"\b(BTC|ETH|SOL|ADA|XRP|DOGE|USDT|USDC|BNB)\b", text, re.I))
        if t == 'commodities':
            return bool(re.search(r"\b(gold|silver|oil|brent|wti|copper|corn|wheat|soy|natural gas)\b", text, re.I))
        if t == 'indices':
            return bool(re.search(r"(s&p|sp500|nasdaq|dow|dax|ftse|nikkei|cac|hang seng|tsx)", text, re.I))
        return False

    def extract_heuristic(self, title: str, content: str):
        """Heuristic extraction when no AI key: returns (type, name) or (None, None)."""
        import re
        text = f"{title} {content}" if content else title
        # Stocks: (AAPL) or EXCHANGE:TICKER
        m = re.search(r"\(([A-Z]{1,6})\)", text)
        if m:
            return ('Stocks', m.group(1))
        m = re.search(r"(nasdaq|nyse|amex|tsx|lse|sehk)\s*[:\-]\s*([A-Z]{1,6})", text, re.I)
        if m:
            return ('Stocks', m.group(2).upper())
        # Forex: EUR/USD or USDJPY
        m = re.search(r"\b([A-Z]{3})/?([A-Z]{3})\b", text)
        if m:
            pair = f"{m.group(1).upper()}/{m.group(2).upper()}"
            return ('Forex', pair)
        # Crypto: names or tickers
        m = re.search(r"\b(BTC|ETH|SOL|ADA|XRP|DOGE|USDT|USDC|BNB)\b", text, re.I)
        if m:
            return ('Crypto', m.group(1).upper())
        m = re.search(r"\b(bitcoin|ethereum|solana|cardano|ripple|dogecoin)\b", text, re.I)
        if m:
            name = m.group(1).lower()
            mapping = {
                'bitcoin': 'BTC', 'ethereum': 'ETH', 'solana': 'SOL',
                'cardano': 'ADA', 'ripple': 'XRP', 'dogecoin': 'DOGE'
            }
            return ('Crypto', mapping.get(name, name.upper()))
        # Commodities
        if re.search(r"\b(gold|silver|oil|brent|wti|copper|corn|wheat|soy|natural gas)\b", text, re.I):
            # Use matched commodity name as instrument_name
            name = re.search(r"\b(gold|silver|oil|brent|wti|copper|corn|wheat|soy|natural gas)\b", text, re.I).group(1)
            return ('Commodities', name.title())
        # Indices
        if re.search(r"(s&p|sp500|nasdaq\s*100?|dow\s*jones|dax|ftse|nikkei|cac|hang\s*seng|tsx)", text, re.I):
            return ('Indices', 'Index')
        return (None, None)

    def process_item(self, item, spider):
        # Verifică dacă AI analysis este disponibil
        if not self.ai_provider or (self.ai_provider == 'openai' and not self.client) or (self.ai_provider == 'ollama' and not self.ollama_model):
            spider.logger.warning(f"AI analysis not available (provider: {self.ai_provider}), using defaults")
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

            # Analizează cu provider-ul configurat
            if self.ai_provider == 'openai':
                response = self.client.chat.completions.create(
                    model="gpt-4o-mini",
                    messages=[
                        {"role": "system", "content": system_prompt},
                        {"role": "user", "content": text_to_analyze}
                    ],
                    max_tokens=300,
                    temperature=0.3
                )
                analysis_result = json.loads(response.choices[0].message.content)
            
            elif self.ai_provider == 'ollama':
                # Folosește Ollama pentru analiză
                ollama_response = requests.post(f"{self.ollama_url}/api/chat", json={
                    "model": self.ollama_model,
                    "messages": [
                        {"role": "system", "content": system_prompt},
                        {"role": "user", "content": text_to_analyze}
                    ],
                    "stream": False,
                    "options": {
                        "temperature": 0.3,
                        "num_predict": 300
                    }
                })
                
                if ollama_response.status_code == 200:
                    ollama_result = ollama_response.json()
                    content = ollama_result.get('message', {}).get('content', '{}')
                    
                    # Încearcă să extractezi JSON din răspuns
                    try:
                        # Caută JSON în răspuns
                        start_idx = content.find('{')
                        end_idx = content.rfind('}') + 1
                        if start_idx != -1 and end_idx > start_idx:
                            json_str = content[start_idx:end_idx]
                            analysis_result = json.loads(json_str)
                        else:
                            raise ValueError("No JSON found in response")
                    except (json.JSONDecodeError, ValueError):
                        # Fallback cu parsing manual dacă JSON nu este valid
                        analysis_result = self._parse_ollama_response(content)
                else:
                    raise Exception(f"Ollama API error: {ollama_response.status_code}")
            else:
                raise Exception(f"Unknown AI provider: {self.ai_provider}")
            
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
        self.saved_count = 0
    
    def open_spider(self, spider):
        # Găsește baza de date existentă
        current_dir = os.path.dirname(os.path.abspath(__file__))
        project_root = os.path.join(current_dir, '..', '..')
        self.db_path = os.path.join(project_root, 'server', 'ainvestorhood.db')
        
        spider.logger.info(f"Connecting to database: {self.db_path}")
        
        # Conectează la baza de date
        self.connection = sqlite3.connect(self.db_path, check_same_thread=False)
        self.connection.execute('PRAGMA journal_mode=WAL')  # Pentru concurrency
        
    def close_spider(self, spider):
        try:
            spider.logger.info(f"saved to database: {self.saved_count}")
        finally:
            if self.connection:
                self.connection.close()
    
    def process_item(self, item, spider):
        try:
            # Guard invalid item
            if item is None or not isinstance(item, dict):
                return item
            # Ensure content_hash exists
            ch = item.get('content_hash')
            if not ch:
                base = f"{item.get('title','')}{item.get('content','')}"
                item['content_hash'] = hashlib.md5(base.encode('utf-8')).hexdigest()

            # Verifică dacă articolul există deja
            cursor = self.connection.cursor()
            cursor.execute(
                "SELECT id FROM news_articles WHERE content_hash = ?",
                (item.get('content_hash',''),)
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
            
            # Enforce non-empty instrument; as last resort, try heuristic one more time and then default to market index
            if not item.get('instrument_name'):
                itype, iname = self.extract_heuristic(item.get('title',''), item.get('content',''))
                if itype and iname:
                    item['instrument_type'] = item.get('instrument_type') or itype
                    item['instrument_name'] = iname
                else:
                    # Default to broad market index so item appears in feed
                    item['instrument_type'] = item.get('instrument_type') or 'Indices'
                    item['instrument_name'] = '^GSPC'

            # Resolve and verify precise Yahoo symbol via platform API. If not verified, optionally keep based on env.
            try:
                platform = os.getenv('PLATFORM_API_URL', 'http://localhost:8080')
                r = requests.post(f"{platform}/api/resolve-yahoo", json={
                    'instrument_type': item.get('instrument_type'),
                    'instrument_name': item.get('instrument_name'),
                    'title': item.get('title','')
                }, timeout=10)
                if r.status_code == 200:
                    data = r.json() or {}
                    symbol = data.get('symbol')
                    if symbol:
                        item['instrument_name'] = symbol
                    else:
                        # Fallback: allow unverified instruments if enabled
                        allow_unverified = os.getenv('ALLOW_UNVERIFIED_INSTRUMENTS', '1') in ('1','true','yes')
                        if not allow_unverified:
                            return item  # drop silently
                else:
                    if os.getenv('ALLOW_UNVERIFIED_INSTRUMENTS', '1') not in ('1','true','yes'):
                        return item
            except Exception as e:
                spider.logger.warning(f"Resolve-yahoo failed: {e}")
                if os.getenv('ALLOW_UNVERIFIED_INSTRUMENTS', '1') not in ('1','true','yes'):
                    return item

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
            self.saved_count += 1
            spider.logger.info(f"✅ Article saved to database: {item.get('title', '')[:50]}...")
            
        except Exception as e:
            spider.logger.error(f"❌ Database error: {str(e)}")
            self.connection.rollback()
        
        return item