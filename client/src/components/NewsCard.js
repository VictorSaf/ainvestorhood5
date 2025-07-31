import React, { useState, useEffect } from 'react';
import { ArrowUp, ArrowDown, Minus, ExternalLink, Clock, Zap } from 'lucide-react';
import { FinancialIcon } from './FinancialIcons';

const NewsCard = ({ article, index, isNew = false }) => {
  const [isVisible, setIsVisible] = useState(false);

  useEffect(() => {
    // Animate card entrance
    const timer = setTimeout(() => setIsVisible(true), 100);
    return () => clearTimeout(timer);
  }, []);
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
    
    try {
      const date = new Date(dateString);
      // Check if date is valid
      if (isNaN(date.getTime())) return 'Unknown';
      
      const day = date.getDate().toString().padStart(2, '0');
      const month = (date.getMonth() + 1).toString().padStart(2, '0');
      const year = date.getFullYear();
      const hours = date.getHours().toString().padStart(2, '0');
      const minutes = date.getMinutes().toString().padStart(2, '0');
      const seconds = date.getSeconds().toString().padStart(2, '0');
      
      return `${day}/${month}/${year} ${hours}:${minutes}:${seconds}`;
    } catch (error) {
      console.warn('Date parsing error:', error, 'for dateString:', dateString);
      return 'Unknown';
    }
  };

  const handleSourceClick = (e) => {
    e.preventDefault();
    if (article.source_url) {
      window.open(article.source_url, '_blank', 'noopener,noreferrer');
    }
  };

  return (
    <article className={`
      mb-6 rounded-2xl bg-white shadow-lg border-2 transition-all duration-600 
      ${isVisible ? 'opacity-100 translate-y-0' : 'opacity-0 translate-y-5'}
      ${isNew ? 'border-blue-500 shadow-blue-200' : 'border-transparent hover:shadow-xl'}
    `}>
      {/* Header */}
      <div className="flex items-center justify-between p-5 border-b border-gray-100 bg-gradient-to-r from-blue-50 to-purple-50 rounded-t-2xl">
        <div className="flex items-center space-x-3">
          <div className="p-2 bg-gradient-to-br from-blue-500 to-purple-600 rounded-xl shadow-lg">
            <FinancialIcon 
              instrumentType={article.instrument_type} 
              size={24} 
            />
          </div>
          <div>
            <div className="text-xs font-bold text-blue-600 uppercase tracking-wider">
              {article.instrument_type?.toUpperCase() || 'GENERAL'}
            </div>
            {article.instrument_name && (
              <div className="text-sm font-semibold text-green-600">
                {article.instrument_name}
              </div>
            )}
          </div>
        </div>
        
        <div className="flex items-center space-x-2">
          {isNew && (
            <div className="flex items-center px-3 py-1 bg-gradient-to-r from-blue-500 to-purple-600 text-white text-xs font-bold rounded-full shadow-lg">
              <Zap size={10} className="mr-1" />
              NEW
            </div>
          )}
          <div className="flex items-center px-2 py-1 bg-gray-100 rounded-lg">
            <Clock size={12} className="text-gray-500 mr-1" />
            <span className="text-xs text-gray-600 font-medium">
              {formatExactTime(article.published_at || article.created_at)}
            </span>
          </div>
          {article.source_url && (
            <button 
              onClick={handleSourceClick} 
              className="p-2 bg-gray-100 hover:bg-gray-200 rounded-lg transition-colors"
              title="View Source"
            >
              <ExternalLink size={12} className="text-gray-600" />
            </button>
          )}
        </div>
      </div>

      {/* Content */}
      <div className="p-5">
        <h3 className="text-lg font-bold text-gray-900 mb-3 leading-tight line-clamp-2">
          {article.title}
        </h3>
        <p className="text-gray-600 text-sm leading-relaxed line-clamp-3">
          {article.summary}
        </p>
      </div>

      {/* Footer */}
      <div className="flex items-center justify-between px-5 py-4 bg-gradient-to-r from-blue-50 to-purple-50 border-t border-gray-100">
        <div>
          <div 
            className="inline-flex items-center px-4 py-2 rounded-full text-white font-bold text-sm uppercase tracking-wider shadow-lg"
            style={{ backgroundColor: getRecommendationColor(article.recommendation) }}
          >
            {getRecommendationIcon(article.recommendation)}
            <span className="ml-2">{article.recommendation}</span>
          </div>
        </div>

        <div className="text-right">
          <div className="text-xs font-semibold text-green-600 mb-2">
            {article.confidence_score >= 80 ? 'High Confidence' : 
             article.confidence_score >= 60 ? 'Medium Confidence' : 'Low Confidence'}
          </div>
          <div className="flex items-center space-x-2">
            <div className="w-20 h-2 bg-gray-200 rounded-full overflow-hidden">
              <div 
                className="h-full rounded-full transition-all duration-300"
                style={{ 
                  width: `${article.confidence_score}%`,
                  backgroundColor: getConfidenceBarColor(article.confidence_score)
                }}
              />
            </div>
            <span className="text-sm font-bold text-gray-900 min-w-[35px]">
              {article.confidence_score}%
            </span>
          </div>
        </div>
      </div>
    </article>
  );
};

export default NewsCard;