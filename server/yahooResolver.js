const axios = require('axios');

const PREFERRED_STOCK_EXCHANGES = ['NASDAQ', 'NYSE', 'AMEX'];

function extractTicker(candidate) {
  if (!candidate) return null;
  const s = String(candidate).trim();
  if (s.includes(':')) return s.split(':').pop().toUpperCase().replace(/[^A-Z]/g, '');
  return s.toUpperCase().replace(/[^A-Z]/g, '');
}

async function searchYahoo(query) {
  try {
    const url = `https://query1.finance.yahoo.com/v1/finance/search?q=${encodeURIComponent(query)}&lang=en-US&quotesCount=10&newsCount=0`;
    const resp = await axios.get(url, { headers: { 'User-Agent': 'Mozilla/5.0 (NewsBot)' }, timeout: 10000 });
    return resp.data || {};
  } catch (e) {
    return {};
  }
}

async function verifyYahooSymbol(symbol) {
  if (!symbol) return false;
  try {
    const symForUrl = encodeURIComponent(symbol); // handles ^ and =
    const url = `https://query1.finance.yahoo.com/v10/finance/quoteSummary/${symForUrl}?modules=price`;
    const resp = await axios.get(url, { headers: { 'User-Agent': 'Mozilla/5.0 (NewsBot)' }, timeout: 8000 });
    const ok = resp && resp.status === 200 && resp.data && resp.data.quoteSummary && Array.isArray(resp.data.quoteSummary.result) && resp.data.quoteSummary.result.length > 0;
    return !!ok;
  } catch (e) {
    return false;
  }
}

async function resolveStockSymbol(name, title = '') {
  const candidate = extractTicker(name);
  if (!candidate) return null;
  const data = await searchYahoo(candidate);
  const quotes = Array.isArray(data.quotes) ? data.quotes : [];
  // Prefer exact symbol match
  let best = quotes.find(q => (q.symbol || '').toUpperCase() === candidate);
  if (!best) {
    // Prefer preferred exchanges
    const ranked = quotes
      .filter(q => (q.quoteType || '').toUpperCase() === 'EQUITY')
      .sort((a, b) => {
        const ax = PREFERRED_STOCK_EXCHANGES.indexOf((a.exchange || '').toUpperCase());
        const bx = PREFERRED_STOCK_EXCHANGES.indexOf((b.exchange || '').toUpperCase());
        return (ax === -1 ? 999 : ax) - (bx === -1 ? 999 : bx);
      });
    best = ranked[0];
  }
  const chosen = best ? best.symbol : candidate;
  const verified = await verifyYahooSymbol(chosen);
  return verified ? chosen : null;
}

function resolveForexSymbol(name) {
  const pair = String(name).replace(/\s|\//g, '').toUpperCase();
  if (pair.length >= 6) return `${pair}=X`;
  return null;
}

function resolveCryptoSymbol(name) {
  const sym = String(name).replace(/[^A-Za-z]/g, '').toUpperCase();
  if (!sym) return null;
  return `${sym}-USD`;
}

function resolveCommoditySymbol(name) {
  const map = {
    gold: 'GC=F', silver: 'SI=F', oil: 'CL=F', wti: 'CL=F', brent: 'BZ=F',
    copper: 'HG=F', 'natural gas': 'NG=F', gas: 'NG=F', corn: 'ZC=F', wheat: 'ZW=F', soy: 'ZS=F', soybeans: 'ZS=F'
  };
  const key = String(name).toLowerCase();
  return map[key] || map[key.replace(/\s+/g, ' ')] || null;
}

function resolveIndexSymbol(name) {
  const rules = [
    { re: /(s&p|sp-?500)/i, sym: '^GSPC' },
    { re: /nasdaq\s*100/i, sym: '^NDX' },
    { re: /nasdaq|nasdaq\s*composite/i, sym: '^IXIC' },
    { re: /dow|dow\s*jones/i, sym: '^DJI' },
    { re: /dax/i, sym: '^GDAXI' },
    { re: /ftse\s*100|ftse/i, sym: '^FTSE' },
    { re: /nikkei|225/i, sym: '^N225' },
    { re: /cac|40/i, sym: '^FCHI' },
    { re: /hang\s*seng|hsi/i, sym: '^HSI' },
    { re: /tsx|s&p\s*tsx/i, sym: '^GSPTSE' }
  ];
  for (const r of rules) if (r.re.test(String(name))) return r.sym;
  return null;
}

async function resolveYahooSymbol(instrumentType, instrumentName, title = '') {
  const t = String(instrumentType || '').toLowerCase();
  if (!instrumentName) return null;
  let sym = null;
  if (t === 'stocks') sym = await resolveStockSymbol(instrumentName, title);
  else if (t === 'forex') sym = resolveForexSymbol(instrumentName);
  else if (t === 'crypto') sym = resolveCryptoSymbol(instrumentName);
  else if (t === 'commodities') sym = resolveCommoditySymbol(instrumentName);
  else if (t === 'indices') sym = resolveIndexSymbol(instrumentName);
  if (!sym) return null;
  const verified = await verifyYahooSymbol(sym);
  return verified ? sym : null;
}

module.exports = { resolveYahooSymbol, verifyYahooSymbol };


