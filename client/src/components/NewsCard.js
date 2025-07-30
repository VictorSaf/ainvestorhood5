import React from 'react';
import { ArrowUp, ArrowDown, Minus, ExternalLink, Clock } from 'lucide-react';
import { FinancialIcon } from './FinancialIcons';
import './NewsCard.css';

const NewsCard = ({ article, index }) => {
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
                {article.instrument_name}
              </span>
            )}
          </div>
        </div>
        
        <div className="card-meta">
          <span className="time-ago" title={`Published: ${article.published_at || article.created_at}`}>
            <Clock size={12} />
            {formatExactTime(article.published_at || article.created_at)}
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