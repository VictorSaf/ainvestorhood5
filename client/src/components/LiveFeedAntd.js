import React, { useState, useEffect, useRef } from 'react';
import { io } from 'socket.io-client';
import {
  Layout,
  Card,
  Badge,
  Button,
  Space,
  Typography,
  Statistic,
  Spin,
  Empty,
  Alert,
  Row,
  Col,
  Affix,
  Tooltip
} from 'antd';
import {
  ReloadOutlined,
  SettingOutlined,
  MonitorOutlined,
  RiseOutlined,
  WifiOutlined,
  ThunderboltOutlined,
  ExclamationCircleOutlined,
  CheckCircleOutlined,
  SyncOutlined,
  LineChartOutlined
} from '@ant-design/icons';
import AntdNewsCard from './AntdNewsCard';

const { Header, Content, Footer } = Layout;
const { Title, Text } = Typography;

const LiveFeedAntd = ({ initialNews = [], hasApiKey, stats, onRefresh, onSettings, onMonitoring, onAIDashboard }) => {
  const [articles, setArticles] = useState(initialNews);
  const [socket, setSocket] = useState(null);
  const [isConnected, setIsConnected] = useState(false);
  const [isProcessing, setIsProcessing] = useState(false);
  const [newArticleIds, setNewArticleIds] = useState(new Set());
  const [processingStats, setProcessingStats] = useState({ processed: 0, duplicates: 0, errors: 0 });
  const feedRef = useRef(null);

  useEffect(() => {
    if (!hasApiKey) return;

    // Connect to WebSocket
    const newSocket = io('http://localhost:8080');
    
    newSocket.on('connect', () => {
      console.log('🔗 Connected to live feed');
      setIsConnected(true);
    });

    newSocket.on('disconnect', () => {
      console.log('❌ Disconnected from live feed');
      setIsConnected(false);
    });

    // Handle initial articles
    newSocket.on('initial-articles', (initialArticles) => {
      console.log(`📰 WEBSOCKET: Received ${initialArticles.length} initial articles:`, initialArticles);
      setArticles(initialArticles);
      console.log('📰 WEBSOCKET: Articles state updated via WebSocket!');
    });

    // Handle new articles
    newSocket.on('new-article', (data) => {
      console.log('🆕 New article received:', data.article.title.substring(0, 50));
      
      setArticles(prev => {
        // Add new article at the beginning
        const updated = [data.article, ...prev];
        // Keep only latest 50 articles
        return updated.slice(0, 50);
      });

      // Mark as new for animation
      setNewArticleIds(prev => new Set([...prev, data.article.id]));
      
      // Remove new status after animation
      setTimeout(() => {
        setNewArticleIds(prev => {
          const updated = new Set(prev);
          updated.delete(data.article.id);
          return updated;
        });
      }, 3000);

      // Auto-scroll to top for new articles
      if (feedRef.current) {
        feedRef.current.scrollTo({
          top: 0,
          behavior: 'smooth'
        });
      }
    });

    // Handle article updates
    newSocket.on('article-updated', (data) => {
      console.log('🔄 Article updated:', data.article.title.substring(0, 50));
      
      setArticles(prev => 
        prev.map(article => 
          article.id === data.article.id ? data.article : article
        )
      );
    });

    // Handle processing status
    newSocket.on('processing-status', (data) => {
      setIsProcessing(data.isProcessing);
    });

    // Handle collection progress
    newSocket.on('collection-progress', (data) => {
      setProcessingStats({
        processed: data.processed || 0,
        duplicates: data.duplicates || 0,
        errors: data.errors || 0
      });
    });

    // Handle articles sync
    newSocket.on('articles-sync', (data) => {
      console.log(`🔄 Articles synced: ${data.articles.length} articles`);
      setArticles(data.articles);
    });

    setSocket(newSocket);

    return () => {
      if (newSocket) {
        newSocket.disconnect();
      }
    };
  }, [hasApiKey]);

  // Update articles when initialNews changes
  useEffect(() => {
    console.log('🔄 LiveFeedAntd useEffect triggered. initialNews:', initialNews);
    if (initialNews.length > 0) {
      console.log('🔄 Setting articles from initialNews:', initialNews.length, initialNews);
      setArticles(initialNews);
      console.log('🔄 LiveFeedAntd articles state updated!');
    } else {
      console.log('❌ LiveFeedAntd: No initial news to set');
    }
  }, [initialNews]);

  if (!hasApiKey) {
    return (
      <Layout style={{ minHeight: '100vh', background: 'linear-gradient(135deg, #f0f2f5 0%, #e6f7ff 100%)' }}>
        <Content style={{ 
          display: 'flex', 
          justifyContent: 'center', 
          alignItems: 'center',
          padding: '50px' 
        }}>
          <Card 
            style={{ 
              textAlign: 'center', 
              maxWidth: 500,
              borderRadius: '16px',
              boxShadow: '0 8px 32px rgba(0,0,0,0.1)' 
            }}
          >
            <ExclamationCircleOutlined 
              style={{ 
                fontSize: '64px', 
                color: '#faad14', 
                marginBottom: '24px' 
              }} 
            />
            <Title level={3} style={{ color: '#1a1a1a', marginBottom: '16px' }}>
              API Key Required
            </Title>
            <Text style={{ fontSize: '16px', color: '#666', lineHeight: '1.6' }}>
              Please set up your OpenAI API key to start receiving live financial news.
            </Text>
          </Card>
        </Content>
      </Layout>
    );
  }

  return (
    <Layout style={{ 
      minHeight: '100vh',
      background: 'linear-gradient(135deg, #f0f2f5 0%, #e6f7ff 50%, #f0f2f5 100%)'
    }}>
      <Affix offsetTop={0}>
        <Header style={{
          background: 'rgba(255, 255, 255, 0.95)',
          backdropFilter: 'blur(10px)',
          borderBottom: '1px solid rgba(0,0,0,0.06)',
          boxShadow: '0 2px 8px rgba(0,0,0,0.06)',
          padding: '0 24px',
          height: 'auto',
          lineHeight: 'normal',
          position: 'sticky',
          top: 0,
          zIndex: 1000
        }}>
          <div style={{ padding: '12px 0' }}>
            <Row gutter={[16, 16]} align="middle" justify="space-between">
              {/* Logo and Brand */}
              <Col flex="0 0 auto">
                <Space size={16} align="center">
                  <div style={{
                    background: 'linear-gradient(135deg, #1890ff 0%, #722ed1 100%)',
                    padding: '12px',
                    borderRadius: '12px',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    boxShadow: '0 4px 12px rgba(24, 144, 255, 0.3)'
                  }}>
                    <RiseOutlined style={{ fontSize: '24px', color: 'white' }} />
                  </div>
                  <div>
                    <Title level={3} style={{ 
                      margin: 0, 
                      background: 'linear-gradient(135deg, #1890ff 0%, #722ed1 100%)',
                      backgroundClip: 'text',
                      WebkitBackgroundClip: 'text',
                      WebkitTextFillColor: 'transparent',
                      fontSize: '24px',
                      fontWeight: '700'
                    }}>
                      AIInvestorHood
                    </Title>
                  </div>
                </Space>
              </Col>

              {/* Statistics */}
              {stats && (
                <Col flex="0 0 auto">
                  <Card size="small" style={{ 
                    borderRadius: '20px',
                    background: 'rgba(0,0,0,0.02)',
                    border: '1px solid rgba(0,0,0,0.04)'
                  }}>
                    <Row gutter={24}>
                      <Col>
                        <Statistic
                          title="News"
                          value={stats.totalArticles}
                          prefix={<RiseOutlined />}
                          valueStyle={{ fontSize: '18px', fontWeight: '700' }}
                        />
                      </Col>
                      <Col>
                        <Statistic
                          title="Confidence"
                          value={stats.averageConfidence}
                          suffix="%"
                          prefix={<CheckCircleOutlined />}
                          valueStyle={{ fontSize: '18px', fontWeight: '700' }}
                        />
                      </Col>
                    </Row>
                  </Card>
                </Col>
              )}

              {/* Connection Status */}
              <Col flex="0 0 auto">
                <Badge 
                  status={isConnected ? "processing" : "error"} 
                  text={
                    <Text strong style={{ 
                      fontSize: '13px',
                      textTransform: 'uppercase',
                      letterSpacing: '0.5px',
                      color: isConnected ? '#52c41a' : '#ff4d4f'
                    }}>
                      {isConnected ? 'Live' : 'Offline'}
                    </Text>
                  }
                />
              </Col>

              {/* Processing Status */}
              {isProcessing && (
                <Col flex="0 0 auto">
                  <Alert
                    message={
                      <Space>
                        <Spin size="small" />
                        <Text strong>Analyzing news...</Text>
                      </Space>
                    }
                    type="info"
                    showIcon={false}
                    style={{
                      background: 'linear-gradient(135deg, #1890ff 0%, #722ed1 100%)',
                      color: 'white',
                      border: 'none',
                      borderRadius: '20px',
                      fontSize: '13px'
                    }}
                  />
                </Col>
              )}

              {/* Processing Stats */}
              <Col flex="0 0 auto">
                <Space size={16}>
                  <Text type="secondary">
                    <RiseOutlined style={{ marginRight: '4px' }} />
                    {processingStats.processed} new
                  </Text>
                  <Text type="secondary">
                    {processingStats.duplicates} filtered
                  </Text>
                  {processingStats.errors > 0 && (
                    <Text type="danger">
                      {processingStats.errors} errors
                    </Text>
                  )}
                </Space>
              </Col>

              {/* Control Buttons */}
              <Col flex="0 0 auto">
                <Space size={8}>
                  <Tooltip title="Refresh News">
                    <Button 
                      type="text" 
                      icon={<ReloadOutlined />}
                      onClick={onRefresh}
                      style={{ borderRadius: '8px' }}
                    />
                  </Tooltip>
                  <Tooltip title="System Monitor">
                    <Button 
                      type="text" 
                      icon={<MonitorOutlined />}
                      onClick={onMonitoring}
                      style={{ borderRadius: '8px' }}
                    />
                  </Tooltip>
                  <Tooltip title="Settings">
                    <Button 
                      type="text" 
                      icon={<SettingOutlined />}
                      onClick={onSettings}
                      style={{ borderRadius: '8px' }}
                    />
                  </Tooltip>
                </Space>
              </Col>
            </Row>
          </div>
        </Header>
      </Affix>

      <Content 
        ref={feedRef}
        style={{ 
          padding: '24px',
          overflow: 'auto',
          maxHeight: 'calc(100vh - 140px)'
        }}
      >
        <div style={{ maxWidth: '1000px', margin: '0 auto' }}>
          {articles.length === 0 ? (
            <Card style={{ 
              textAlign: 'center', 
              borderRadius: '16px',
              marginTop: '80px',
              boxShadow: '0 8px 32px rgba(0,0,0,0.08)'
            }}>
              <Empty
                image={<LineChartOutlined style={{ fontSize: '64px', color: '#d9d9d9' }} />}
                imageStyle={{ height: '100px' }}
                description={
                  <div>
                    <Title level={4} style={{ color: '#8c8c8c', marginBottom: '8px' }}>
                      No articles yet
                    </Title>
                    <Text type="secondary" style={{ fontSize: '16px' }}>
                      Waiting for financial news to be analyzed...
                    </Text>
                  </div>
                }
              >
                {isProcessing && (
                  <Alert
                    message={
                      <Space>
                        <Spin />
                        <Text strong>Processing articles...</Text>
                      </Space>
                    }
                    type="info"
                    style={{
                      marginTop: '24px',
                      borderRadius: '12px',
                      background: 'linear-gradient(135deg, #e6f7ff 0%, #f0f5ff 100%)'
                    }}
                  />
                )}
              </Empty>
            </Card>
          ) : (
            <div>
              {articles.map((article, index) => (
                <AntdNewsCard
                  key={article.id}
                  article={article}
                  index={index}
                  isNew={newArticleIds.has(article.id)}
                />
              ))}
            </div>
          )}
        </div>
      </Content>

      {isConnected && articles.length > 0 && (
        <Affix offsetBottom={0}>
          <Footer style={{
            background: 'rgba(255, 255, 255, 0.95)',
            backdropFilter: 'blur(10px)',
            borderTop: '1px solid rgba(0,0,0,0.06)',
            textAlign: 'center',
            padding: '12px 24px',
            boxShadow: '0 -2px 8px rgba(0,0,0,0.06)'
          }}>
            <Badge 
              status="processing" 
              text={
                <Text style={{ 
                  fontSize: '14px', 
                  fontWeight: '500',
                  color: '#52c41a'
                }}>
                  Monitoring {articles.length} articles in real-time
                </Text>
              }
            />
          </Footer>
        </Affix>
      )}
    </Layout>
  );
};

export default LiveFeedAntd;