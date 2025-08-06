import React, { useState, useEffect } from 'react';
import { ArrowUp, ArrowDown, Minus, ExternalLink, Clock, Zap, Edit3 } from 'lucide-react';
import { FinancialIcon } from './FinancialIcons';
import EditableComponent from './EditableComponent';
import { Card, Badge, Button } from './ui';
import { useEditMode } from '../hooks/useEditMode';

const NewsCard = ({ article, index, isNew = false }) => {
  const [isVisible, setIsVisible] = useState(false);
  const { isGlobalEditMode, toggleGlobalEditMode } = useEditMode();

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
    <EditableComponent
      componentName={`NewsCard-${article.id}`}
      onSave={(props) => console.log('NewsCard saved:', props)}
      editableProps={['className', 'variant']}
      allowAddElements={true}
      allowDeleteElements={false}
    >
      <Card className={`
        mb-6 transition-all duration-600 
        ${isVisible ? 'opacity-100 translate-y-0' : 'opacity-0 translate-y-5'}
        ${isNew ? 'border-blue-500 shadow-blue-200' : 'border-transparent hover:shadow-xl'}
      `}>
      <Card.Header className="bg-gradient-to-r from-blue-50 to-purple-50 rounded-t-2xl">
        <div className="flex items-center justify-between">
        <div className="flex items-center space-x-3">
          <EditableComponent
            componentName={`FinancialIcon-${article.id}`}
            onSave={(props) => console.log('Financial icon saved:', props)}
            editableProps={['className']}
            allowAddElements={false}
            allowDeleteElements={false}
          >
            <div className="p-2 bg-gradient-to-br from-blue-500 to-purple-600 rounded-xl shadow-lg">
              <FinancialIcon 
                instrumentType={article.instrument_type} 
                size={24} 
              />
            </div>
          </EditableComponent>
          
          <div>
            <EditableComponent
              componentName={`InstrumentType-${article.id}`}
              onSave={(props) => console.log('Instrument type saved:', props)}
              editableProps={['className', 'children']}
              allowAddElements={false}
              allowDeleteElements={false}
            >
              <div className="text-xs font-bold text-blue-600 uppercase tracking-wider">
                {article.instrument_type?.toUpperCase() || 'GENERAL'}
              </div>
            </EditableComponent>
            
            {article.instrument_name && (
              <EditableComponent
                componentName={`InstrumentName-${article.id}`}
                onSave={(props) => console.log('Instrument name saved:', props)}
                editableProps={['className', 'children']}
                allowAddElements={false}
                allowDeleteElements={false}
              >
                <div className="text-sm font-semibold text-green-600">
                  {article.instrument_name}
                </div>
              </EditableComponent>
            )}
          </div>
        </div>
        
        <div className="flex items-center space-x-2">
          {isNew && (
            <EditableComponent
              componentName={`NewBadge-${article.id}`}
              onSave={(props) => console.log('New badge saved:', props)}
              editableProps={['className', 'children']}
              allowAddElements={false}
              allowDeleteElements={false}
            >
              <div className="flex items-center px-3 py-1 bg-gradient-to-r from-blue-500 to-purple-600 text-white text-xs font-bold rounded-full shadow-lg">
                <Zap size={10} className="mr-1" />
                NEW
              </div>
            </EditableComponent>
          )}
          
          <EditableComponent
            componentName={`Timestamp-${article.id}`}
            onSave={(props) => console.log('Timestamp saved:', props)}
            editableProps={['className', 'children']}
            allowAddElements={false}
            allowDeleteElements={false}
          >
            <div className="flex items-center px-2 py-1 bg-gray-100 rounded-lg">
              <Clock size={12} className="text-gray-500 mr-1" />
              <span className="text-xs text-gray-600 font-medium">
                {formatExactTime(article.published_at || article.created_at)}
              </span>
            </div>
          </EditableComponent>
          
          {article.source_url && (
            <EditableComponent
              componentName={`SourceButton-${article.id}`}
              onSave={(props) => console.log('Source button saved:', props)}
              editableProps={['className', 'title']}
              allowAddElements={false}
              allowDeleteElements={false}
            >
              <button 
                onClick={handleSourceClick} 
                className="p-2 bg-gray-100 hover:bg-gray-200 rounded-lg transition-colors"
                title="View Source"
              >
                <ExternalLink size={12} className="text-gray-600" />
              </button>
            </EditableComponent>
          )}
          
          <EditableComponent
            componentName={`NewsCardEditButton-${article.id}`}
            onSave={(props) => console.log('NewsCard edit button saved:', props)}
            editableProps={['className', 'title']}
            allowAddElements={false}
            allowDeleteElements={false}
          >
            <button 
              onClick={() => {
                console.log('NewsCard edit button clicked - current mode:', isGlobalEditMode);
                toggleGlobalEditMode();
              }} 
              className={`p-2 rounded-lg transition-colors ${
                isGlobalEditMode 
                  ? 'bg-red-600 text-white hover:bg-red-700' 
                  : 'bg-gray-100 hover:bg-gray-200 text-gray-600'
              }`}
              title={isGlobalEditMode ? "Exit Edit Mode" : "Edit This Card"}
            >
              <Edit3 size={12} />
            </button>
          </EditableComponent>
        </div>
        </div>
      </Card.Header>

      <Card.Body>
        <EditableComponent
          componentName={`ArticleTitle-${article.id}`}
          onSave={(props) => console.log('Article title saved:', props)}
          editableProps={['className', 'children']}
          allowAddElements={false}
          allowDeleteElements={false}
        >
          <h3 className="text-lg font-bold text-gray-900 mb-3 leading-tight line-clamp-2">
            {article.title}
          </h3>
        </EditableComponent>
        
        <EditableComponent
          componentName={`ArticleSummary-${article.id}`}
          onSave={(props) => console.log('Article summary saved:', props)}
          editableProps={['className', 'children']}
          allowAddElements={false}
          allowDeleteElements={false}
        >
          <p className="text-gray-600 text-sm leading-relaxed line-clamp-3">
            {article.summary}
          </p>
        </EditableComponent>
      </Card.Body>

      <Card.Footer className="bg-gradient-to-r from-blue-50 to-purple-50">
        <div className="flex items-center justify-between">
        <div>
          <EditableComponent
            componentName={`RecommendationBadge-${article.id}`}
            onSave={(props) => console.log('Recommendation badge saved:', props)}
            editableProps={['variant', 'size']}
            allowAddElements={false}
            allowDeleteElements={false}
          >
            <Badge 
              variant={article.recommendation === 'BUY' ? 'success' : article.recommendation === 'SELL' ? 'danger' : 'warning'}
              className="flex items-center gap-2 px-4 py-2 text-white font-bold text-sm uppercase tracking-wider shadow-lg"
              style={{ backgroundColor: getRecommendationColor(article.recommendation) }}
            >
              {getRecommendationIcon(article.recommendation)}
              <span>{article.recommendation}</span>
            </Badge>
          </EditableComponent>
        </div>

        <EditableComponent
          componentName={`ConfidenceSection-${article.id}`}
          onSave={(props) => console.log('Confidence section saved:', props)}
          editableProps={['className']}
          allowAddElements={true}
          allowDeleteElements={false}
        >
          <div className="text-right">
            <EditableComponent
              componentName={`ConfidenceLabel-${article.id}`}
              onSave={(props) => console.log('Confidence label saved:', props)}
              editableProps={['className', 'children']}
              allowAddElements={false}
              allowDeleteElements={false}
            >
              <div className="text-xs font-semibold text-green-600 mb-2">
                {article.confidence_score >= 80 ? 'High Confidence' : 
                 article.confidence_score >= 60 ? 'Medium Confidence' : 'Low Confidence'}
              </div>
            </EditableComponent>
            
            <EditableComponent
              componentName={`ConfidenceBar-${article.id}`}
              onSave={(props) => console.log('Confidence bar saved:', props)}
              editableProps={['className']}
              allowAddElements={false}
              allowDeleteElements={false}
            >
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
            </EditableComponent>
          </div>
        </EditableComponent>
        </div>
      </Card.Footer>
      </Card>
    </EditableComponent>
  );
};

export default NewsCard;