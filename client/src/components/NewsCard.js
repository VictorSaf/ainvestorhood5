import React from 'react';
import { ArrowUp, ArrowDown, Minus, ExternalLink, Clock } from 'lucide-react';
import { FinancialIcon } from './FinancialIcons';
import './NewsCard.css';

const NewsCard = ({ article, index }) => {
  const buildYahooFinanceUrl = (type, name) => {
    if (!type || !name) return null;
    const t = String(type).toLowerCase();
    const raw = String(name).trim();
    // Helper maps
    const commodityMap = {
      gold: 'GC=F',
      silver: 'SI=F',
      oil: 'CL=F',
      wti: 'CL=F',
      brent: 'BZ=F',
      copper: 'HG=F',
      'natural gas': 'NG=F',
      gas: 'NG=F',
      corn: 'ZC=F',
      wheat: 'ZW=F',
      soy: 'ZS=F',
      soybeans: 'ZS=F'
    };
    const indexMap = [
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

    if (t === 'stocks') {
      // Accept formats like "NASDAQ:AMD" or "AAPL"
      const ticker = raw.split(':').pop().replace(/[^A-Za-z]/g, '').toUpperCase();
      if (!ticker) return null;
      return `https://finance.yahoo.com/quote/${ticker}`;
    }
    if (t === 'forex') {
      // Formats like EUR/USD or EURUSD -> EURUSD=X
      const pair = raw.replace(/\s|\//g, '').toUpperCase();
      if (!pair || pair.length < 6) return null;
      return `https://finance.yahoo.com/quote/${pair}=X`;
    }
    if (t === 'crypto') {
      // Use USD pairing by default
      const sym = raw.replace(/[^A-Za-z]/g, '').toUpperCase();
      if (!sym) return null;
      return `https://finance.yahoo.com/quote/${sym}-USD`;
    }
    if (t === 'commodities') {
      const key = raw.toLowerCase();
      const sym = commodityMap[key] || commodityMap[key.replace(/\s+/g, ' ')];
      if (sym) return `https://finance.yahoo.com/quote/${sym}`;
      // Fallback common case for generic "Oil"
      return `https://finance.yahoo.com/quote/CL=F`;
    }
    if (t === 'indices') {
      for (const m of indexMap) {
        if (m.re.test(raw)) return `https://finance.yahoo.com/quote/${m.sym}`;
      }
      // Fallback to S&P 500
      return `https://finance.yahoo.com/quote/%5EGSPC`;
    }
    // Generic lookup fallback
    return `https://finance.yahoo.com/lookup?s=${encodeURIComponent(raw)}`;
  };
  const getRecommendationIcon = (recommendation) => {
    switch (recommendation) {
      case 'BUY':
        return <ArrowUp size={16} color="#00C851" />;
      case 'SELL':
        return <ArrowDown size={16} color="#ff4444" />;
      default:
        return <Minus size={16} color="#ffbb33" />;
    }
  };

  const getRecommendationColor = (recommendation) => {
    switch (recommendation) {
      case 'BUY':
        return '#00C851';
      case 'SELL':
        return '#ff4444';
      default:
        return '#ffbb33';
    }
  };

  const getConfidenceBarColor = (score) => {
    if (score >= 80) return '#00C851';
    if (score >= 60) return '#ffbb33';
    return '#ff4444';
  };

  // Removed getInstrumentEmoji - now using FinancialIcon component

  const formatExactTime = (dateString) => {
    if (!dateString) return 'Unknown';
    
    const date = new Date(dateString);
    const day = date.getDate().toString().padStart(2, '0');
    const month = (date.getMonth() + 1).toString().padStart(2, '0');
    const year = date.getFullYear();
    const hours = date.getHours().toString().padStart(2, '0');
    const minutes = date.getMinutes().toString().padStart(2, '0');
    const seconds = date.getSeconds().toString().padStart(2, '0');
    
    return `${day}/${month}/${year} ${hours}:${minutes}:${seconds}`;
  };

  const handleSourceClick = (e) => {
    e.preventDefault();
    if (article.source_url) {
      window.open(article.source_url, '_blank', 'noopener,noreferrer');
    }
  };

  return (
    <article className="news-card">
      <div className="card-header">
        <div className="instrument-info">
          <FinancialIcon 
            instrumentType={article.instrument_type} 
            size={20} 
          />
          <div className="instrument-details">
            <span className="instrument-type">
              {article.instrument_type || 'General'}
            </span>
            {article.instrument_name && (
              <span className="instrument-name">
                <a
                  className="instrument-link"
                  href={buildYahooFinanceUrl(article.instrument_type, article.instrument_name)}
                  target="_blank"
                  rel="noopener noreferrer"
                  title="View on Yahoo Finance"
                  onClick={(e)=>{ if(!buildYahooFinanceUrl(article.instrument_type, article.instrument_name)) e.preventDefault(); }}
                >
                  {article.instrument_name}
                </a>
                <a
                  className="instrument-link-icon"
                  href={buildYahooFinanceUrl(article.instrument_type, article.instrument_name)}
                  target="_blank"
                  rel="noopener noreferrer"
                  aria-label="Open on Yahoo Finance"
                >
                  <ExternalLink size={12} />
                </a>
              </span>
            )}
          </div>
        </div>
        
        <div className="card-meta">
          <span className="time-ago">
            <Clock size={12} />
            {formatExactTime(article.published_at)}
          </span>
          {article.source_url && (
            <button className="source-btn" onClick={handleSourceClick} title="View Source">
              <ExternalLink size={12} />
            </button>
          )}
        </div>
      </div>

      <div className="card-content">
        <h3 className="article-title">{article.title}</h3>
        <p className="article-summary">{article.summary}</p>
      </div>

      <div className="card-footer">
        <div className="recommendation">
          <div 
            className="recommendation-badge"
            style={{ backgroundColor: getRecommendationColor(article.recommendation) }}
          >
            {getRecommendationIcon(article.recommendation)}
            <span className="recommendation-text">
              {article.recommendation}
            </span>
          </div>
        </div>

        <div className="confidence-score">
          <div className="confidence-label">
            Confidence: {article.confidence_score}%
          </div>
          <div className="confidence-bar">
            <div 
              className="confidence-fill"
              style={{ 
                width: `${article.confidence_score}%`,
                backgroundColor: getConfidenceBarColor(article.confidence_score)
              }}
            />
          </div>
        </div>
      </div>
    </article>
  );
};

export default NewsCard;