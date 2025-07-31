import React, { useState, useEffect, useRef } from 'react';
import { io } from 'socket.io-client';
import { Activity, Zap, TrendingUp, AlertCircle } from 'lucide-react';
import {
  Layout,
  Card,
  Row,
  Col,
  Statistic,
  Progress,
  Table,
  Modal,
  Button,
  Badge,
  Tag,
  Space,
  Typography,
  Tooltip,
  Alert,
  Spin,
  Descriptions,
  List
} from 'antd';
import {
  DashboardOutlined,
  MonitorOutlined,
  DatabaseOutlined,
  RobotOutlined,
  BugOutlined,
  ApiOutlined,
  GlobalOutlined,
  BarChartOutlined,
  EyeOutlined,
  ExclamationCircleOutlined,
  CheckCircleOutlined,
  ClockCircleOutlined,
  SyncOutlined
} from '@ant-design/icons';
import { Line } from 'react-chartjs-2';
import {
  Chart as ChartJS,
  CategoryScale,
  LinearScale,
  PointElement,
  LineElement,
  Title as ChartTitle,
  Tooltip as ChartTooltip,
  Legend,
  Filler,
} from 'chart.js';
import NewsCard from './NewsCard';

// Register Chart.js components
ChartJS.register(
  CategoryScale,
  LinearScale,
  PointElement,
  LineElement,
  ChartTitle,
  ChartTooltip,
  Legend,
  Filler
);

const { Header, Content, Sider } = Layout;
const { Title, Text } = Typography;

const LiveFeedWithMonitoring = ({ initialNews = [], hasApiKey }) => {
  // Feed state
  const [articles, setArticles] = useState(initialNews);
  const [socket, setSocket] = useState(null);
  const [isConnected, setIsConnected] = useState(false);
  const [isProcessing, setIsProcessing] = useState(false);
  const [newArticleIds, setNewArticleIds] = useState(new Set());
  const [stats, setStats] = useState({ processed: 0, duplicates: 0, errors: 0 });
  
  // Monitoring state
  const [metrics, setMetrics] = useState(null);
  const [lastUpdate, setLastUpdate] = useState(new Date());
  const [showDatabaseModal, setShowDatabaseModal] = useState(false);
  const [databaseQueries, setDatabaseQueries] = useState([]);
  const [showApiModal, setShowApiModal] = useState(false);
  const [apiRequests, setApiRequests] = useState([]);
  const [showLogsModal, setShowLogsModal] = useState(false);
  const [httpLogs, setHttpLogs] = useState([]);
  
  const feedRef = useRef(null);
  const socketRef = useRef(null);

  useEffect(() => {
    if (!hasApiKey) return;

    // Connect to WebSocket for both feed and monitoring
    const newSocket = io('http://localhost:8080');
    socketRef.current = newSocket;
    
    // Feed connections
    newSocket.on('connect', () => {
      console.log('🔗 Connected to live feed and monitoring');
      setIsConnected(true);
    });

    newSocket.on('disconnect', () => {
      console.log('❌ Disconnected from live feed and monitoring');
      setIsConnected(false);
    });

    // Reactivez doar încărcarea inițială a articolelor
    newSocket.on('initial-articles', (initialArticles) => {
      console.log(`📰 Received ${initialArticles.length} initial articles`);
      setArticles(initialArticles);
    });

    // Reactivez doar adăugarea de articole noi (nu refresh de articole existente)
    newSocket.on('new-article', (data) => {
      console.log('🆕 New article received:', data.article.title.substring(0, 50));
      
      setArticles(prev => {
        // Verifică dacă articolul nu există deja
        const exists = prev.some(article => article.id === data.article.id);
        if (exists) {
          console.log('Article already exists, skipping');
          return prev; // Nu modifica dacă există deja
        }
        
        const updated = [data.article, ...prev];
        return updated.slice(0, 50);
      });

      setNewArticleIds(prev => new Set([...prev, data.article.id]));
      
      setTimeout(() => {
        setNewArticleIds(prev => {
          const updated = new Set(prev);
          updated.delete(data.article.id);
          return updated;
        });
      }, 3000);

      if (feedRef.current) {
        feedRef.current.scrollTo({
          top: 0,
          behavior: 'smooth'
        });
      }
    });

    // newSocket.on('article-updated', (data) => {
    //   console.log('🔄 Article updated - THIS MIGHT CAUSE REFRESH:', data.article.title.substring(0, 50));
    //   
    //   setArticles(prev => 
    //     prev.map(article => 
    //       article.id === data.article.id ? data.article : article
    //     )
    //   );
    // });

    // DEZACTIVATE ȘI ACESTEA PENTRU A OPRI ORICE REFRESH
    // newSocket.on('processing-status', (data) => {
    //   setIsProcessing(data.isProcessing);
    // });

    // newSocket.on('collection-progress', (data) => {
    //   setStats({
    //     processed: data.processed || 0,
    //     duplicates: data.duplicates || 0,
    //     errors: data.errors || 0
    //   });
    // });

    // Commented out to prevent full refresh of all cards
    // newSocket.on('articles-sync', (data) => {
    //   console.log(`🔄 Articles synced: ${data.articles.length} articles`);
    //   setArticles(data.articles);
    // });

    // Monitoring events
    newSocket.on('systemMetrics', (data) => {
      setMetrics(prev => ({
        ...prev,
        system: data
      }));
      setLastUpdate(new Date());
    });

    newSocket.on('httpMetrics', (data) => {
      setMetrics(prev => ({
        ...prev,
        http: data
      }));
    });

    newSocket.on('databaseMetrics', (data) => {
      setMetrics(prev => ({
        ...prev,
        database: data
      }));
    });

    newSocket.on('aiMetrics', (data) => {
      setMetrics(prev => ({
        ...prev,
        ai: data
      }));
    });

    newSocket.on('websocketMetrics', (data) => {
      setMetrics(prev => ({
        ...prev,
        websocket: data
      }));
    });

    newSocket.on('scrapyMetrics', (data) => {
      setMetrics(prev => ({
        ...prev,
        scrapy: data
      }));
    });

    setSocket(newSocket);

    // Initial metrics fetch
    fetchMetrics();

    return () => {
      if (newSocket) {
        newSocket.disconnect();
      }
    };
  }, [hasApiKey]);

  // Setez articolele inițiale din props (FORȚAT)
  useEffect(() => {
    console.log('🔄 LiveFeedWithMonitoring useEffect triggered. initialNews:', initialNews);
    if (initialNews.length > 0) {
      console.log('🔄 FORCING initial articles from props:', initialNews.length, initialNews);
      setArticles(initialNews);
      console.log('🔄 Articles state updated!');
    } else {
      console.log('❌ No initial news to set');
    }
  }, [initialNews]); // Include initialNews ca dependency

  const fetchMetrics = async () => {
    try {
      const response = await fetch('http://localhost:8080/api/monitor/metrics');
      const data = await response.json();
      setMetrics(data);
    } catch (error) {
      console.error('Error fetching metrics:', error);
    }
  };


  const fetchDatabaseQueries = async () => {
    try {
      const response = await fetch('http://localhost:8080/api/monitor/database-queries?limit=100');
      const data = await response.json();
      setDatabaseQueries(data.queries || []);
    } catch (error) {
      console.error('Error fetching database queries:', error);
    }
  };

  const fetchApiRequests = async () => {
    try {
      const response = await fetch('http://localhost:8080/api/monitor/requests?limit=100');
      const data = await response.json();
      setApiRequests(data.requests || []);
    } catch (error) {
      console.error('Error fetching API requests:', error);
    }
  };

  const fetchHttpLogs = async () => {
    try {
      const response = await fetch('http://localhost:8080/api/monitor/logs?level=INFO&limit=200&event=HTTP_REQUEST_END');
      const data = await response.json();
      
      const formattedLogs = data.map(log => {
        const logData = log.data || {};
        return {
          id: log.id,
          timestamp: new Date(log.timestamp),
          method: logData.method || 'GET',
          url: logData.url || '/',
          statusCode: logData.statusCode || 200,
          duration: logData.duration || 0,
          ip: logData.ip || 'Unknown',
          route: logData.route || logData.url || '/',
          responseSize: logData.responseSize || 0,
          level: log.level,
          isError: logData.statusCode >= 400
        };
      }).sort((a, b) => b.timestamp - a.timestamp);
      
      setHttpLogs(formattedLogs);
    } catch (error) {
      console.error('Error fetching HTTP logs:', error);
    }
  };

  if (!hasApiKey) {
    return (
      <div className="flex flex-col items-center justify-center h-96 p-10 text-center text-gray-500">
        <AlertCircle size={48} className="text-gray-400 mb-4" />
        <h3 className="text-lg font-semibold text-gray-700 mb-2">API Key Required</h3>
        <p className="text-sm leading-relaxed">Please set up your OpenAI API key to start receiving live financial news.</p>
      </div>
    );
  }

  // Feed Tab Content
  const FeedTab = () => (
    <div style={{ 
      height: '100%', 
      overflow: 'auto', 
      background: 'linear-gradient(135deg, #f0f2f5 0%, #e6f7ff 50%, #f0f2f5 100%)'
    }} ref={feedRef}>
      {/* Header */}
      <Card 
        size="small" 
        style={{ 
          margin: '0', 
          borderRadius: '0', 
          borderBottom: '1px solid #f0f0f0',
          position: 'sticky',
          top: 0,
          zIndex: 50
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: '16px' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '12px', flex: 1 }}>
            <Activity size={20} style={{ color: '#1890ff' }} />
            <Title level={4} style={{ margin: 0, color: '#262626' }}>Live Financial News</Title>
            <Badge 
              status={isConnected ? "processing" : "error"} 
              text={
                <Text style={{ fontSize: '12px', fontWeight: '600', textTransform: 'uppercase' }}>
                  {isConnected ? 'Live' : 'Offline'}
                </Text>
              }
            />
          </div>

          {isProcessing && (
            <Tag color="processing" style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
              <Spin size="small" />
              Analyzing news...
            </Tag>
          )}

          <div style={{ display: 'flex', alignItems: 'center', gap: '16px' }}>
            <Space>
              <Text type="secondary" style={{ fontSize: '12px' }}>
                <TrendingUp size={12} style={{ marginRight: '4px' }} />
                {stats.processed} new
              </Text>
              <Text type="secondary" style={{ fontSize: '12px' }}>
                {stats.duplicates} filtered
              </Text>
              {stats.errors > 0 && (
                <Text type="danger" style={{ fontSize: '12px' }}>
                  {stats.errors} errors
                </Text>
              )}
            </Space>
          </div>

        </div>
      </Card>

      <div style={{ padding: '20px', maxWidth: '1000px', margin: '0 auto' }}>
        {articles.length === 0 ? (
          <div style={{ textAlign: 'center', padding: '80px 20px' }}>
            <TrendingUp size={48} style={{ color: '#d9d9d9', marginBottom: '16px' }} />
            <Title level={4} style={{ color: '#8c8c8c', marginBottom: '8px' }}>No articles yet</Title>
            <Text type="secondary" style={{ marginBottom: '20px', display: 'block' }}>
              Waiting for financial news to be analyzed...
            </Text>
            {isProcessing && (
              <Tag color="processing" style={{ display: 'inline-flex', alignItems: 'center', gap: '6px', padding: '8px 16px' }}>
                <Spin size="small" />
                Processing articles...
              </Tag>
            )}
          </div>
        ) : (
          <div style={{ maxWidth: '800px', margin: '0 auto' }}>
            {articles.map((article, index) => (
              <NewsCard
                key={article.id}
                article={article}
                index={index}
                isNew={newArticleIds.has(article.id)}
              />
            ))}
          </div>
        )}
      </div>

      {isConnected && articles.length > 0 && (
        <Card 
          size="small" 
          style={{ 
            margin: '0', 
            borderRadius: '0', 
            borderTop: '1px solid #f0f0f0',
            position: 'sticky',
            bottom: 0
          }}
        >
          <div style={{ textAlign: 'center' }}>
            <Badge status="processing" text={
              <Text type="secondary" style={{ fontSize: '12px' }}>
                Monitoring {articles.length} articles in real-time
              </Text>
            } />
          </div>
        </Card>
      )}
    </div>
  );

  // Overview Tab Content
  const OverviewTab = () => (
    <Row gutter={[16, 16]}>
      {/* System Metrics */}
      <Col xs={24} sm={12} lg={6}>
        <Card title="System Performance" size="small">
          <Space direction="vertical" style={{ width: '100%' }}>
            <div>
              <Text type="secondary">CPU Usage</Text>
              <Progress 
                percent={metrics?.system?.cpu?.usage || 0} 
                status={metrics?.system?.cpu?.usage > 80 ? 'exception' : 'active'}
                size="small"
              />
            </div>
            <div>
              <Text type="secondary">Memory Usage</Text>
              <Progress 
                percent={metrics?.system?.memory?.percentage || 0}
                status={metrics?.system?.memory?.percentage > 80 ? 'exception' : 'active'}
                size="small"
              />
            </div>
            <Statistic 
              title="Uptime" 
              value={(() => {
                const seconds = Math.floor((metrics?.system?.uptime || 0));
                const hours = Math.floor(seconds / 3600);
                const minutes = Math.floor((seconds % 3600) / 60);
                return `${hours}h ${minutes}m`;
              })()}
              prefix={<ClockCircleOutlined />}
            />
          </Space>
        </Card>
      </Col>

      {/* HTTP Metrics */}
      <Col xs={24} sm={12} lg={6}>
        <Card title="HTTP Activity" size="small">
          <Space direction="vertical" style={{ width: '100%' }}>
            <Statistic 
              title="Total Requests" 
              value={metrics?.http?.requests?.total || 0}
              prefix={<ApiOutlined />}
            />
            <Statistic 
              title="Active Requests" 
              value={metrics?.http?.requests?.active || 0}
              prefix={<GlobalOutlined />}
            />
            <Statistic 
              title="Errors" 
              value={metrics?.http?.requests?.errors || 0}
              prefix={<ExclamationCircleOutlined />}
              valueStyle={{ color: metrics?.http?.requests?.errors > 0 ? '#cf1322' : '#3f8600' }}
            />
          </Space>
        </Card>
      </Col>

      {/* Database Metrics */}
      <Col xs={24} sm={12} lg={6}>
        <Card 
          title="Database" 
          size="small"
          extra={
            <Button 
              type="link" 
              size="small" 
              onClick={() => {
                fetchDatabaseQueries();
                setShowDatabaseModal(true);
              }}
            >
              <EyeOutlined />
            </Button>
          }
        >
          <Space direction="vertical" style={{ width: '100%' }}>
            <Statistic 
              title="Queries" 
              value={metrics?.database?.queries?.total || 0}
              prefix={<DatabaseOutlined />}
            />
            <Statistic 
              title="Avg Response Time" 
              value={metrics?.database?.queries?.avgTime || 0}
              suffix="ms"
              prefix={<ClockCircleOutlined />}
            />
            <div>
              <Badge 
                status={metrics?.database?.connected ? "success" : "error"} 
                text={metrics?.database?.connected ? "Connected" : "Disconnected"}
              />
            </div>
          </Space>
        </Card>
      </Col>

      {/* AI Metrics */}
      <Col xs={24} sm={12} lg={6}>
        <Card title="AI Services" size="small">
          <Space direction="vertical" style={{ width: '100%' }}>
            <Statistic 
              title="Requests" 
              value={metrics?.ai?.requests?.total || 0}
              prefix={<RobotOutlined />}
            />
            <Statistic 
              title="Avg Processing" 
              value={metrics?.ai?.avgResponseTime || 0}
              suffix="ms"
              prefix={<ClockCircleOutlined />}
            />
            <Statistic 
              title="Tokens Used" 
              value={metrics?.ai?.tokens?.used || 0}
              prefix={<BarChartOutlined />}
            />
          </Space>
        </Card>
      </Col>
    </Row>
  );

  return (
    <Layout style={{ height: '100vh' }}>
      <Header style={{ 
        background: '#fff', 
        padding: '0 24px', 
        borderBottom: '1px solid #f0f0f0',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between'
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '16px' }}>
          <Title level={4} style={{ margin: 0, color: '#1890ff' }}>
            AIInvestorHood5 - Live Feed
          </Title>
          <Badge 
            status={isConnected ? "success" : "error"} 
            text={isConnected ? `Connected (${lastUpdate.toLocaleTimeString()})` : "Disconnected"}
          />
        </div>
      </Header>

      <Content style={{ overflow: 'hidden' }}>
        <FeedTab />
      </Content>

      {/* Database Queries Modal */}
      <Modal
        title="Database Queries"
        open={showDatabaseModal}
        onCancel={() => setShowDatabaseModal(false)}
        width={1000}
        footer={null}
      >
        <Table
          dataSource={databaseQueries}
          rowKey="id"
          size="small"
          columns={[
            { title: 'Time', dataIndex: 'timestamp', render: (timestamp) => new Date(timestamp).toLocaleTimeString() },
            { title: 'Type', dataIndex: 'type', render: (type) => <Tag color="blue">{type}</Tag> },
            { title: 'Duration', dataIndex: 'duration', render: (duration) => `${duration}ms` },
            { title: 'Query', dataIndex: 'query', ellipsis: true }
          ]}
          pagination={{ pageSize: 20 }}
        />
      </Modal>

      {/* API Requests Modal */}
      <Modal
        title="API Requests"
        open={showApiModal}
        onCancel={() => setShowApiModal(false)}
        width={1200}
        footer={null}
      >
        <Table
          dataSource={apiRequests}
          rowKey="id"
          size="small"
          columns={[
            { title: 'Time', dataIndex: 'timestamp', render: (timestamp) => new Date(timestamp).toLocaleTimeString() },
            { title: 'Method', dataIndex: 'method', render: (method) => <Tag color="green">{method}</Tag> },
            { title: 'Status', dataIndex: 'statusCode', render: (code) => <Badge status={code >= 400 ? 'error' : 'success'} text={code} /> },
            { title: 'URL', dataIndex: 'url', ellipsis: true },
            { title: 'Duration', dataIndex: 'duration', render: (duration) => `${duration}ms` },
            { title: 'IP', dataIndex: 'ip' }
          ]}
          pagination={{ pageSize: 20 }}
        />
      </Modal>

      {/* HTTP Logs Modal */}
      <Modal
        title="HTTP Activity Logs"
        open={showLogsModal}
        onCancel={() => setShowLogsModal(false)}
        width={1400}
        footer={null}
      >
        <Table
          dataSource={httpLogs}
          rowKey="id"
          size="small"
          columns={[
            { title: 'Time', dataIndex: 'timestamp', render: (timestamp) => timestamp.toLocaleTimeString() },
            { title: 'Method', dataIndex: 'method', render: (method) => <Tag color={method === 'GET' ? 'green' : 'blue'}>{method}</Tag> },
            { title: 'Status', dataIndex: 'statusCode', render: (code) => <Badge status={code >= 400 ? 'error' : 'success'} text={code} /> },
            { title: 'URL', dataIndex: 'url', ellipsis: true },
            { title: 'Duration', dataIndex: 'duration', render: (duration) => <Text style={{ color: duration > 1000 ? '#ff4d4f' : '#52c41a' }}>{duration}ms</Text> },
            { title: 'Size', dataIndex: 'responseSize', render: (size) => size > 0 ? `${(size / 1024).toFixed(1)}KB` : '-' },
            { title: 'IP', dataIndex: 'ip', ellipsis: true }
          ]}
          pagination={{ pageSize: 30 }}
          rowClassName={(record) => record.isError ? 'error-row' : ''}
        />
      </Modal>
    </Layout>
  );
};

export default LiveFeedWithMonitoring;