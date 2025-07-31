import React, { useState, useEffect } from 'react';
import {
  Card,
  Badge,
  Tag,
  Progress,
  Button,
  Space,
  Typography,
  Tooltip,
  Avatar
} from 'antd';
import {
  ArrowUpOutlined,
  ArrowDownOutlined,
  MinusOutlined,
  LinkOutlined,
  ClockCircleOutlined,
  ThunderboltOutlined,
  RiseOutlined,
  StockOutlined,
  DollarOutlined,
  BankOutlined,
  GlobalOutlined
} from '@ant-design/icons';

const { Text, Title } = Typography;

const AntdNewsCard = ({ article, index, isNew = false }) => {
  const [isVisible, setIsVisible] = useState(false);

  useEffect(() => {
    // Animate card entrance - FĂRĂ DEPENDENCY PE INDEX
    const timer = setTimeout(() => setIsVisible(true), 100);
    return () => clearTimeout(timer);
  }, []); // Fără dependencies pentru a evita re-render-uri

  const getRecommendationIcon = (recommendation) => {
    switch (recommendation) {
      case 'BUY':
        return <ArrowUpOutlined />;
      case 'SELL':
        return <ArrowDownOutlined />;
      default:
        return <MinusOutlined />;
    }
  };

  const getRecommendationColor = (recommendation) => {
    switch (recommendation) {
      case 'BUY':
        return 'success';
      case 'SELL':
        return 'error';
      default:
        return 'warning';
    }
  };

  const getConfidenceStatus = (score) => {
    if (score >= 80) return { status: 'success', text: 'High Confidence' };
    if (score >= 60) return { status: 'warning', text: 'Medium Confidence' };
    return { status: 'error', text: 'Low Confidence' };
  };

  const getInstrumentIcon = (instrumentType) => {
    switch (instrumentType?.toLowerCase()) {
      case 'stock':
      case 'stocks':
        return <StockOutlined />;
      case 'crypto':
      case 'cryptocurrency':
        return <DollarOutlined />;
      case 'forex':
        return <GlobalOutlined />;
      case 'commodity':
      case 'commodities':
        return <BankOutlined />;
      default:
        return <RiseOutlined />;
    }
  };

  const formatExactTime = (dateString) => {
    if (!dateString) return 'Unknown';
    
    try {
      const date = new Date(dateString);
      if (isNaN(date.getTime())) return 'Unknown';
      
      return date.toLocaleString('ro-RO', {
        day: '2-digit',
        month: '2-digit',
        year: 'numeric',
        hour: '2-digit',
        minute: '2-digit',
        second: '2-digit'
      });
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

  const confidenceStatus = getConfidenceStatus(article.confidence_score);

  const cardTitle = (
    <Space size={12}>
      <Avatar 
        icon={getInstrumentIcon(article.instrument_type)} 
        size={40}
        style={{ 
          background: 'linear-gradient(135deg, #1890ff 0%, #40a9ff 100%)',
          color: 'white',
          boxShadow: '0 4px 12px rgba(24, 144, 255, 0.3)',
          border: '2px solid rgba(255,255,255,0.9)'
        }}
      />
      <div>
        <Text strong style={{ 
          color: '#1890ff', 
          fontSize: '13px',
          fontWeight: '700',
          textTransform: 'uppercase',
          letterSpacing: '0.8px',
          display: 'block',
          lineHeight: '1.2'
        }}>
          {article.instrument_type?.toUpperCase() || 'GENERAL'}
        </Text>
        {article.instrument_name && (
          <Text style={{ 
            fontSize: '13px', 
            color: '#52c41a',
            fontWeight: '600',
            display: 'block',
            lineHeight: '1.3',
            marginTop: '2px'
          }}>
            {article.instrument_name}
          </Text>
        )}
      </div>
    </Space>
  );

  const cardExtra = (
    <Space size={8}>
      {isNew && (
        <Badge 
          count={
            <div style={{ 
              background: 'linear-gradient(135deg, #1890ff 0%, #722ed1 100%)', 
              color: 'white', 
              fontSize: '11px',
              fontWeight: '700',
              padding: '4px 10px',
              borderRadius: '12px',
              display: 'flex',
              alignItems: 'center',
              gap: '4px',
              boxShadow: '0 2px 8px rgba(24, 144, 255, 0.4)',
              textTransform: 'uppercase',
              letterSpacing: '0.5px'
            }}>
              <ThunderboltOutlined style={{ fontSize: '10px' }} />
              NEW
            </div>
          }
        />
      )}
      <Tooltip title={`Published: ${article.published_at || article.created_at}`}>
        <div style={{
          background: 'rgba(0,0,0,0.05)',
          padding: '6px 10px',
          borderRadius: '8px',
          display: 'flex',
          alignItems: 'center',
          gap: '4px'
        }}>
          <ClockCircleOutlined style={{ 
            fontSize: '12px',
            color: '#666'
          }} />
          <Text style={{ 
            fontSize: '11px',
            color: '#666',
            fontWeight: '500',
            lineHeight: '1'
          }}>
            {formatExactTime(article.published_at || article.created_at)}
          </Text>
        </div>
      </Tooltip>
      {article.source_url && (
        <Button 
          type="text" 
          size="small"
          icon={<LinkOutlined />} 
          onClick={handleSourceClick}
          style={{ 
            color: '#666',
            borderRadius: '8px',
            padding: '6px',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            background: 'rgba(0,0,0,0.05)',
            border: 'none'
          }}
        />
      )}
    </Space>
  );

  return (
    <Card
      title={cardTitle}
      extra={cardExtra}
      size="default"
      style={{
        marginBottom: '24px',
        borderRadius: '16px',
        opacity: isVisible ? 1 : 0,
        transform: isVisible ? 'translateY(0)' : 'translateY(20px)',
        transition: 'all 0.6s cubic-bezier(0.4, 0, 0.2, 1)',
        border: isNew ? '2px solid #1890ff' : 'none',
        boxShadow: isNew 
          ? '0 8px 32px rgba(24, 144, 255, 0.2), 0 2px 8px rgba(0, 0, 0, 0.1)' 
          : '0 4px 20px rgba(0, 0, 0, 0.08), 0 2px 8px rgba(0, 0, 0, 0.04)',
        background: isNew 
          ? 'linear-gradient(135deg, #ffffff 0%, #f8faff 100%)' 
          : 'linear-gradient(135deg, #ffffff 0%, #fafafa 100%)',
        overflow: 'hidden',
        position: 'relative'
      }}
      hoverable
      bodyStyle={{ 
        padding: '20px',
        background: 'transparent'
      }}
      headStyle={{
        background: 'linear-gradient(135deg, rgba(255,255,255,0.9) 0%, rgba(248,250,255,0.9) 100%)',
        backdropFilter: 'blur(10px)',
        borderBottom: '1px solid rgba(0,0,0,0.06)',
        borderRadius: '16px 16px 0 0'
      }}
    >
      {/* Article Content */}
      <div style={{ marginBottom: '20px', position: 'relative' }}>
        <Title 
          level={4} 
          style={{ 
            marginBottom: '12px', 
            lineHeight: '1.5',
            fontSize: '18px',
            fontWeight: '700',
            color: '#1a1a1a',
            letterSpacing: '-0.01em',
            display: '-webkit-box',
            WebkitLineClamp: 2,
            WebkitBoxOrient: 'vertical',
            overflow: 'hidden'
          }}
        >
          {article.title}
        </Title>
        <Text 
          style={{ 
            fontSize: '15px',
            lineHeight: '1.6',
            color: '#4a5568',
            display: '-webkit-box',
            WebkitLineClamp: 3,
            WebkitBoxOrient: 'vertical',
            overflow: 'hidden',
            fontWeight: '400'
          }}
        >
          {article.summary}
        </Text>
      </div>

      {/* Footer with Recommendation and Confidence */}
      <div style={{ 
        display: 'flex', 
        justifyContent: 'space-between', 
        alignItems: 'center',
        background: 'linear-gradient(135deg, rgba(248,250,255,0.8) 0%, rgba(240,245,255,0.8) 100%)',
        margin: '-20px -20px -20px -20px',
        padding: '16px 20px',
        borderTop: '1px solid rgba(0,0,0,0.06)',
        backdropFilter: 'blur(5px)'
      }}>
        <div>
          <Tag 
            color={getRecommendationColor(article.recommendation)}
            icon={getRecommendationIcon(article.recommendation)}
            style={{
              fontWeight: '700',
              fontSize: '13px',
              padding: '6px 16px',
              borderRadius: '20px',
              border: 'none',
              boxShadow: '0 2px 8px rgba(0,0,0,0.1)',
              textTransform: 'uppercase',
              letterSpacing: '0.5px'
            }}
          >
            {article.recommendation}
          </Tag>
        </div>

        <div style={{ textAlign: 'right', minWidth: '140px' }}>
          <div style={{ marginBottom: '8px' }}>
            <Badge 
              status={confidenceStatus.status} 
              text={
                <Text style={{ 
                  fontSize: '12px', 
                  fontWeight: '600',
                  color: '#52c41a'
                }}>
                  {confidenceStatus.text}
                </Text>
              }
            />
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: '10px', justifyContent: 'flex-end' }}>
            <Progress
              percent={article.confidence_score}
              size="small"
              style={{ width: '80px', margin: 0 }}
              strokeColor={{
                '0%': article.confidence_score >= 80 ? '#52c41a' :
                      article.confidence_score >= 60 ? '#faad14' : '#ff4d4f',
                '100%': article.confidence_score >= 80 ? '#73d13d' :
                        article.confidence_score >= 60 ? '#ffc53d' : '#ff7875'
              }}
              trailColor="rgba(0,0,0,0.06)"
              strokeWidth={6}
              showInfo={false}
            />
            <Text strong style={{ 
              fontSize: '14px', 
              fontWeight: '700',
              color: '#1a1a1a',
              minWidth: '35px' 
            }}>
              {article.confidence_score}%
            </Text>
          </div>
        </div>
      </div>
    </Card>
  );
};

export default AntdNewsCard;