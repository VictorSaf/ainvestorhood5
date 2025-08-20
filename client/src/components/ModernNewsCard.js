import React, { useState, useEffect } from 'react';
import { ArrowUp, ArrowDown, Minus, ExternalLink, Clock, Zap, TrendingUp } from 'lucide-react';
import { FinancialIcon } from './FinancialIcons';

const ModernNewsCard = ({ article, index, isNew = false }) => {
  const [isVisible, setIsVisible] = useState(false);

  useEffect(() => {
    // Animate card entrance
    const timer = setTimeout(() => setIsVisible(true), index * 100);
    return () => clearTimeout(timer);
  }, [index]);

  const getRecommendationIcon = (recommendation) => {
    switch (recommendation) {
      case 'BUY':
        return <ArrowUp size={18} strokeWidth={2.5} />;
      case 'SELL':
        return <ArrowDown size={18} strokeWidth={2.5} />;
      default:
        return <Minus size={18} strokeWidth={2.5} />;
    }
  };

  const getRecommendationStyles = (recommendation) => {
    switch (recommendation) {
      case 'BUY':
        return 'bg-gradient-to-r from-emerald-500 to-emerald-600 shadow-lg shadow-emerald-500/30 text-white';
      case 'SELL':
        return 'bg-gradient-to-r from-red-500 to-red-600 shadow-lg shadow-red-500/30 text-white';
      default:
        return 'bg-gradient-to-r from-amber-500 to-amber-600 shadow-lg shadow-amber-500/30 text-white';
    }
  };

  const getConfidenceLevel = (score) => {
    if (score >= 80) return { level: 'High', color: 'text-emerald-600', bg: 'bg-emerald-500' };
    if (score >= 60) return { level: 'Medium', color: 'text-amber-600', bg: 'bg-amber-500' };
    return { level: 'Low', color: 'text-red-600', bg: 'bg-red-500' };
  };

  const buildYahooFinanceUrl = (type, name) => {
    if (!type || !name) return null;
    const t = String(type).toLowerCase();
    const raw = String(name).trim();
    const commodityMap = {
      gold: 'GC=F', silver: 'SI=F', oil: 'CL=F', wti: 'CL=F', brent: 'BZ=F',
      copper: 'HG=F', 'natural gas': 'NG=F', gas: 'NG=F', corn: 'ZC=F', wheat: 'ZW=F', soy: 'ZS=F', soybeans: 'ZS=F'
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
      const ticker = raw.split(':').pop().replace(/[^A-Za-z]/g, '').toUpperCase();
      if (!ticker) return null;
      return `https://finance.yahoo.com/quote/${ticker}`;
    }
    if (t === 'forex') {
      const pair = raw.replace(/\s|\//g, '').toUpperCase();
      if (!pair || pair.length < 6) return null;
      return `https://finance.yahoo.com/quote/${pair}=X`;
    }
    if (t === 'crypto') {
      const sym = raw.replace(/[^A-Za-z]/g, '').toUpperCase();
      if (!sym) return null;
      return `https://finance.yahoo.com/quote/${sym}-USD`;
    }
    if (t === 'commodities') {
      const key = raw.toLowerCase();
      const sym = commodityMap[key] || commodityMap[key.replace(/\s+/g, ' ')];
      return `https://finance.yahoo.com/quote/${sym || 'CL=F'}`;
    }
    if (t === 'indices') {
      for (const m of indexMap) {
        if (m.re.test(raw)) return `https://finance.yahoo.com/quote/${m.sym}`;
      }
      return `https://finance.yahoo.com/quote/%5EGSPC`;
    }
    return `https://finance.yahoo.com/lookup?s=${encodeURIComponent(raw)}`;
  };

  const openGoogleSearch = (e) => {
    e.preventDefault();
    const q = encodeURIComponent(`${article.instrument_name || ''} ${article.instrument_type || ''}`.trim() || article.title);
    window.open(`https://www.google.com/search?q=${q}`, '_blank', 'noopener,noreferrer');
  };

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

  const recommendationStyles = getRecommendationStyles(article.recommendation);
  const confidenceLevel = getConfidenceLevel(article.confidence_score);

  return (
    <article className={`relative bg-white border border-gray-200 transition-all duration-500 hover:shadow-xl hover:shadow-gray-200/50 hover:-translate-y-1 overflow-hidden ${
      isVisible ? 'opacity-100 translate-y-0' : 'opacity-0 translate-y-4'
    } ${isNew ? 'ring-2 ring-blue-500 ring-opacity-50' : ''}`}>
      {isNew && (
        <div className="absolute top-3 right-3 z-10 flex items-center gap-1 px-2 py-1 bg-gradient-to-r from-blue-500 to-purple-600 text-white text-xs font-bold rounded-full shadow-lg">
          <Zap size={10} />
          <span>NEW</span>
        </div>
      )}

      {/* Gradient overlay */}
      <div className="absolute inset-0 bg-gradient-to-br from-white via-transparent to-gray-50/30 pointer-events-none"></div>
      
      {/* Header */}
      <div className="relative p-4 pb-0">
        <div className="flex items-start justify-between">
          <div className="flex items-center gap-3">
            <div className="flex items-center justify-center w-12 h-12 bg-gradient-to-br from-blue-50 to-indigo-100 rounded-xl border border-blue-200/50">
              <FinancialIcon 
                instrumentType={article.instrument_type} 
                size={24} 
              />
            </div>
            
            <div className="flex flex-col">
              <span className="text-xs font-bold text-blue-600 uppercase tracking-wider">
                {article.instrument_type?.toUpperCase() || 'GENERAL'}
              </span>
              {article.instrument_name && (
                <span className="text-sm font-medium text-gray-700">
                  <a
                    className="text-blue-600 underline decoration-dotted hover:decoration-solid"
                    href="#"
                    title="Search on Google"
                    onClick={openGoogleSearch}
                  >
                    {article.instrument_name}
                  </a>
                  <a
                    className="inline-flex items-center ml-1 text-gray-400 hover:text-gray-700"
                    href="#"
                    onClick={openGoogleSearch}
                    aria-label="Search on Google"
                  >
                    <ExternalLink size={12} />
                  </a>
                </span>
              )}
            </div>
          </div>

          <div className="flex items-center gap-2">
            <div className="flex items-center gap-1 px-2 py-1 bg-gray-100 rounded-full text-xs text-gray-600">
              <Clock size={10} />
              <span title={`Published at: ${article.published_at || 'Unknown'}`}>{formatExactTime(article.published_at)}</span>
            </div>
            
            {article.source_url && (
              <button 
                className="p-2 hover:bg-gray-100 rounded-full transition-colors text-gray-500 hover:text-gray-700"
                onClick={handleSourceClick}
              >
                <ExternalLink size={14} />
              </button>
            )}
          </div>
        </div>
      </div>

      {/* Content */}
      <div className="relative p-4">
        <h3 className="text-lg font-bold text-gray-900 mb-2 leading-tight line-clamp-2">
          {article.title}
        </h3>
        <p className="text-sm text-gray-600 leading-relaxed line-clamp-3">
          {article.summary}
        </p>
      </div>

      {/* Footer */}
      <div className="relative px-4 pb-4 flex items-center justify-between gap-4">
        <div className="flex items-center gap-3">
          <div className={`flex items-center gap-2 px-3 py-2 rounded-full font-semibold text-sm ${recommendationStyles}`}>
            {getRecommendationIcon(article.recommendation)}
            <span>{article.recommendation}</span>
          </div>
        </div>

        <div className="flex flex-col items-end gap-1">
          <div className={`flex items-center gap-1 text-xs font-medium ${confidenceLevel.color}`}>
            <TrendingUp size={12} />
            <span>{confidenceLevel.level} Confidence</span>
          </div>
          
          <div className="flex items-center gap-2">
            <div className="w-16 h-2 bg-gray-200 rounded-full overflow-hidden">
              <div 
                className={`h-full ${confidenceLevel.bg} transition-all duration-700 ease-out`}
                style={{ width: `${article.confidence_score}%` }}
              />
            </div>
            <span className="text-xs font-bold text-gray-700">
              {article.confidence_score}%
            </span>
          </div>
        </div>
      </div>
    </article>
  );
};

export default ModernNewsCard;