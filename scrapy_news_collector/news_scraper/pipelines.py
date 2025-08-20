import hashlib
import sqlite3
import os
import sys
import json
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
        # Use platform AI (Node server -> Ollama/OpenAI) if available
        self.platform_url = os.getenv('PLATFORM_API_URL', 'http://localhost:8080')
    
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
        # Try platform AI first
        if self.platform_url:
            try:
                resp = requests.post(
                    f"{self.platform_url}/api/analyze",
                    json={
                        'title': item.get('title',''),
                        'content': item.get('content','')[:5000],
                        'url': item.get('url','')
                    }, timeout=25
                )
                if resp.status_code == 200:
                    data = resp.json()
                    if data.get('success') and isinstance(data.get('analysis'), dict):
                        analysis_result = data['analysis']
                        # Normalize instrument type labels
                        itype = analysis_result.get('instrument_type', 'General')
                        mapping = {
                            'stock': 'Stocks', 'stocks': 'Stocks',
                            'forex': 'Forex',
                            'crypto': 'Crypto', 'cryptocurrency': 'Crypto',
                            'commodity': 'Commodities', 'commodities': 'Commodities',
                            'index': 'Indices', 'indices': 'Indices',
                            'bond': 'Bonds', 'bonds': 'Bonds'
                        }
                        item['instrument_type'] = mapping.get(str(itype).lower(), itype)
                        item['instrument_name'] = analysis_result.get('instrument_name', '')
                        # Respect user rule: skip HOLD recommendations
                        rec = analysis_result.get('recommendation', 'HOLD')
                        if str(rec).upper() == 'HOLD':
                            spider.logger.info("Skipping HOLD recommendation article")
                            return None
                        item['recommendation'] = rec
                        try:
                            item['confidence_score'] = int(analysis_result.get('confidence_score', 50))
                        except Exception:
                            item['confidence_score'] = 50
                        item['analysis'] = analysis_result.get('summary') or analysis_result.get('analysis', '')
                        # Enforce tradable instrument; if not tradable, fallback to heuristic extraction instead of dropping
                        if not self.is_tradable(item['instrument_type'], item['instrument_name'], item.get('title','')):
                            itype, iname = self.extract_heuristic(item.get('title',''), item.get('content',''))
                            if itype and iname:
                                item['instrument_type'] = itype
                                item['instrument_name'] = iname
                                item['recommendation'] = item.get('recommendation', 'HOLD') or 'HOLD'
                                item['confidence_score'] = item.get('confidence_score', 50) or 50
                                item['analysis'] = item.get('analysis') or 'Heuristic after AI non-tradable'
                            else:
                                # Last resort: allow unverified instruments when enabled
                                allow_unverified = os.getenv('ALLOW_UNVERIFIED_INSTRUMENTS', '1') in ('1','true','yes')
                                if allow_unverified:
                                    item['instrument_type'] = item.get('instrument_type') or 'Indices'
                                    item['instrument_name'] = item.get('instrument_name') or '^GSPC'
                                    item['recommendation'] = item.get('recommendation', 'HOLD') or 'HOLD'
                                    item['confidence_score'] = item.get('confidence_score', 50) or 50
                                    item['analysis'] = item.get('analysis') or 'Unverified instrument (allowed)'
                                else:
                                    spider.logger.info("Skipping non-tradable article (platform AI + heuristic failed)")
                                    return None
                        return item
            except Exception as e:
                spider.logger.warning(f"Platform AI call failed: {e}")

        # Fallback: heuristic classification
        itype, iname = self.extract_heuristic(item.get('title',''), item.get('content',''))
        if not itype or not iname:
            spider.logger.info("Skipping article (heuristic not tradable)")
            return None
        item['instrument_type'] = itype
        item['instrument_name'] = iname
        # Heuristic fallback: if we can't classify via platform, default to BUY/SELL inference is not reliable,
        # but per user request we skip HOLD; choose SELL only when strong negative words exist, else BUY.
        import re
        text = (item.get('title','') + ' ' + item.get('content','')).lower()
        negative = re.search(r"\b(down|plunge|drop|selloff|bearish|cut guidance|misses|fraud|lawsuit)\b", text)
        item['recommendation'] = 'SELL' if negative else 'BUY'
        item['confidence_score'] = 50
        item['analysis'] = 'Heuristic classification (platform AI unavailable)'
        return item

class DatabasePipeline:
    """Pipeline pentru salvarea în baza de date SQLite"""
    
    def __init__(self):
        self.connection = None
        self.db_path = None
        self.saved_count = 0
    
    def open_spider(self, spider):
        # Folosește aceeași bază de date ca serverul Node
        # Preferă variabila de mediu DB_PATH (setată în container la /app/data/ainvestorhood.db)
        self.db_path = os.getenv('DB_PATH') or '/app/data/ainvestorhood.db'
        
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