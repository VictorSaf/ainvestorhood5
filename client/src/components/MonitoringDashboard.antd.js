import React, { useState, useEffect, useRef } from 'react';
import io from 'socket.io-client';
import {
  Layout,
  Card,
  Row,
  Col,
  Tabs,
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
  List,
  Divider
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
  ReloadOutlined,
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
import AIDashboard from './AIDashboard.antd';

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
const { TabPane } = Tabs;

const MonitoringDashboard = () => {
  // State management
  const [metrics, setMetrics] = useState(null);
  const [logs, setLogs] = useState([]);
  const [isConnected, setIsConnected] = useState(false);
  const [activeTab, setActiveTab] = useState('overview');
  const [showAIDashboard, setShowAIDashboard] = useState(false);
  const [lastUpdate, setLastUpdate] = useState(new Date());
  const [streamingActive, setStreamingActive] = useState(false);
  const [scrapySources, setScrapySources] = useState([]);
  const [sourceStats, setSourceStats] = useState(null);
  const [sourcesLoading, setSourcesLoading] = useState(false);
  const [showFullSourcesList, setShowFullSourcesList] = useState(false);
  
  const socketRef = useRef(null);

  // WebSocket connection and data fetching
  useEffect(() => {
    socketRef.current = io('http://localhost:8080');
    
    socketRef.current.on('connect', () => {
      setIsConnected(true);
      console.log('Connected to monitoring WebSocket');
    });

    socketRef.current.on('disconnect', () => {
      setIsConnected(false);
      console.log('Disconnected from monitoring WebSocket');
    });

    socketRef.current.on('systemMetrics', (data) => {
      console.log('📊 Received systemMetrics:', data);
      setMetrics(prev => ({
        ...prev,
        system: data
      }));
      setLastUpdate(new Date());
    });

    fetchMetrics();
    const interval = setInterval(fetchMetrics, 5000);

    return () => {
      if (socketRef.current) {
        socketRef.current.disconnect();
      }
      clearInterval(interval);
    };
  }, []);

  // Fetch metrics from API
  const fetchMetrics = async () => {
    try {
      const response = await fetch('http://localhost:8080/api/monitor/metrics');
      if (response.ok) {
        const data = await response.json();
        console.log('📈 Fetched metrics data:', data);
        console.log('📈 System metrics:', data.system);
        setMetrics(data);
      }
    } catch (error) {
      console.error('Failed to fetch metrics:', error);
    }
  };

  // Fetch Scrapy sources
  const fetchScrapySources = async () => {
    if (sourcesLoading) return;
    
    setSourcesLoading(true);
    try {
      const response = await fetch('http://localhost:8080/api/scrapy-sources?limit=100');
      const data = await response.json();
      
      if (data.sources) {
        setScrapySources(data.sources);
        setSourceStats(data.statistics);
      }
    } catch (error) {
      console.error('Failed to fetch scrapy sources:', error);
    } finally {
      setSourcesLoading(false);
    }
  };

  // Fetch all sources for modal
  const fetchAllScrapySources = async () => {
    setSourcesLoading(true);
    try {
      const response = await fetch('http://localhost:8080/api/scrapy-sources?limit=1000');
      const data = await response.json();
      
      if (data.sources) {
        setScrapySources(data.sources);
        setSourceStats(data.statistics);
      }
    } catch (error) {
      console.error('Failed to fetch all scrapy sources:', error);
    } finally {
      setSourcesLoading(false);
    }
  };

  // Load sources when scrapy tab is active
  useEffect(() => {
    if (activeTab === 'scrapy') {
      fetchScrapySources();
    }
  }, [activeTab]);

  // Format uptime helper
  const formatUptime = (uptime) => {
    const seconds = Math.floor(uptime / 1000);
    const hours = Math.floor(seconds / 3600);
    const minutes = Math.floor((seconds % 3600) / 60);
    return `${hours}h ${minutes}m`;
  };

  // Connection status indicator
  const connectionStatus = (
    <Badge 
      status={isConnected ? "success" : "error"} 
      text={isConnected ? "Connected" : "Disconnected"}
    />
  );

  // Loading state
  if (!metrics) {
    return (
      <Layout style={{ minHeight: '100vh' }}>
        <Content style={{ padding: '50px', textAlign: 'center' }}>
          <Spin size="large" />
          <div style={{ marginTop: 16 }}>
            <Text>Loading monitoring data...</Text>
          </div>
        </Content>
      </Layout>
    );
  }

  // Overview tab content
  const OverviewTab = () => (
    <Row gutter={[16, 16]}>
      {/* System Metrics */}
      <Col xs={24} sm={12} lg={6}>
        <Card title="System Performance" size="small">
          <Space direction="vertical" style={{ width: '100%' }}>
            <div>
              <Text type="secondary">CPU Usage</Text>
              <Progress 
                percent={metrics.system?.cpu?.usage || 0} 
                status={metrics.system?.cpu?.usage > 80 ? 'exception' : 'active'}
                size="small"
              />
            </div>
            <div>
              <Text type="secondary">Memory Usage</Text>
              <Progress 
                percent={metrics.system?.memory?.percentage || 0}
                status={metrics.system?.memory?.percentage > 80 ? 'exception' : 'active'}
                size="small"
              />
            </div>
            <Statistic 
              title="Uptime" 
              value={formatUptime((metrics.system?.uptime || 0) * 1000)}
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
              value={metrics.http?.requests?.total || 0}
              prefix={<ApiOutlined />}
            />
            <Statistic 
              title="Active Requests" 
              value={metrics.http?.requests?.active || 0}
              prefix={<GlobalOutlined />}
            />
            <Statistic 
              title="Errors" 
              value={metrics.http?.requests?.errors || 0}
              prefix={<ExclamationCircleOutlined />}
              valueStyle={{ color: metrics.http?.requests?.errors > 0 ? '#cf1322' : '#3f8600' }}
            />
          </Space>
        </Card>
      </Col>

      {/* Database Metrics */}
      <Col xs={24} sm={12} lg={6}>
        <Card title="Database" size="small">
          <Space direction="vertical" style={{ width: '100%' }}>
            <Statistic 
              title="Queries" 
              value={metrics.database?.queries?.total || 0}
              prefix={<DatabaseOutlined />}
            />
            <Statistic 
              title="Avg Response Time" 
              value={metrics.database?.avgResponseTime || 0}
              suffix="ms"
              prefix={<ClockCircleOutlined />}
            />
            <div>
              <Badge 
                status={metrics.database?.connected ? "success" : "error"} 
                text={metrics.database?.connected ? "Connected" : "Disconnected"}
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
              value={metrics.ai?.requests?.total || 0}
              prefix={<RobotOutlined />}
            />
            <Statistic 
              title="Avg Processing" 
              value={metrics.ai?.avgProcessingTime || 0}
              suffix="ms"
              prefix={<ClockCircleOutlined />}
            />
            <Button 
              type="primary" 
              size="small"
              onClick={() => setShowAIDashboard(true)}
              icon={<EyeOutlined />}
            >
              AI Dashboard
            </Button>
          </Space>
        </Card>
      </Col>
    </Row>
  );

  // Scrapy tab content
  const ScrapyTab = () => (
    <Space direction="vertical" size="large" style={{ width: '100%' }}>
      {sourcesLoading && (
        <Alert
          message="Loading Scrapy sources..."
          type="info"
          showIcon
          icon={<Spin size="small" />}
        />
      )}

      {/* Statistics Cards */}
      <Row gutter={[16, 16]}>
        <Col xs={24} sm={12} lg={6}>
          <Card 
            hoverable
            onClick={() => {
              setShowFullSourcesList(true);
              fetchAllScrapySources();
            }}
            style={{ cursor: 'pointer' }}
          >
            <Statistic
              title="Total Sources"
              value={sourceStats?.total_unique_sources || 0}
              prefix={<GlobalOutlined />}
              valueStyle={{ color: '#1890ff' }}
            />
            <Text type="secondary" style={{ fontSize: '12px' }}>
              <EyeOutlined /> Click to view all sources
            </Text>
          </Card>
        </Col>

        <Col xs={24} sm={12} lg={6}>
          <Card>
            <Statistic
              title="Total Articles"
              value={sourceStats?.total_articles || 0}
              prefix={<BarChartOutlined />}
              valueStyle={{ color: '#52c41a' }}
            />
            <Text type="secondary">Articles collected</Text>
          </Card>
        </Col>

        <Col xs={24} sm={12} lg={6}>
          <Card>
            <Statistic
              title="Active Days"
              value={sourceStats?.total_scraping_days || 0}
              prefix={<ClockCircleOutlined />}
              valueStyle={{ color: '#722ed1' }}
            />
            <Text type="secondary">Days of activity</Text>
          </Card>
        </Col>

        <Col xs={24} sm={12} lg={6}>
          <Card>
            <Statistic
              title="Last Update"
              value={sourceStats?.last_article_date ? 
                new Date(sourceStats.last_article_date).toLocaleDateString() : 'N/A'}
              prefix={<CheckCircleOutlined />}
              valueStyle={{ color: '#fa8c16' }}
            />
            <Text type="secondary">Most recent article</Text>
          </Card>
        </Col>
      </Row>

      {/* Sources Table */}
      <Card title="Recent Sources" size="small">
        <Table
          dataSource={scrapySources}
          columns={[
            {
              title: 'Domain',
              dataIndex: 'domain',
              key: 'domain',
              render: (text) => <Text strong>{text}</Text>
            },
            {
              title: 'Articles',
              dataIndex: 'article_count',
              key: 'article_count',
              render: (count) => <Badge count={count} style={{ backgroundColor: '#52c41a' }} />
            },
            {
              title: 'First Scraped',
              dataIndex: 'first_scraped',
              key: 'first_scraped',
              render: (date) => date ? new Date(date).toLocaleDateString() : 'N/A'
            },
            {
              title: 'Last Scraped',
              dataIndex: 'last_scraped',
              key: 'last_scraped',
              render: (date) => date ? new Date(date).toLocaleDateString() : 'N/A'
            },
            {
              title: 'Status',
              dataIndex: 'status',
              key: 'status',
              render: () => <Tag color="success">Active</Tag>
            }
          ]}
          pagination={{
            pageSize: 10,
            showSizeChanger: true,
            showQuickJumper: true,
            showTotal: (total, range) => `${range[0]}-${range[1]} of ${total} sources`
          }}
          size="small"
        />
      </Card>
    </Space>
  );

  return (
    <Layout style={{ minHeight: '100vh' }}>
      <Header style={{ 
        background: '#fff', 
        padding: '0 24px', 
        boxShadow: '0 2px 8px #f0f1f2',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between'
      }}>
        <Title level={2} style={{ margin: 0, color: '#1890ff' }}>
          <DashboardOutlined /> AIInvestorHood5 Monitor
        </Title>
        <Space>
          {connectionStatus}
          <Text type="secondary">
            Last update: {lastUpdate.toLocaleTimeString()}
          </Text>
          <Button 
            icon={<ReloadOutlined />} 
            onClick={fetchMetrics}
            type="text"
          >
            Refresh
          </Button>
        </Space>
      </Header>

      <Content style={{ padding: '24px' }}>
        <Tabs 
          activeKey={activeTab} 
          onChange={setActiveTab}
          size="large"
          items={[
            {
              key: 'overview',
              label: (
                <span>
                  <DashboardOutlined />
                  Overview
                </span>
              ),
              children: <OverviewTab />
            },
            {
              key: 'system',
              label: (
                <span>
                  <MonitorOutlined />
                  System
                </span>
              ),
              children: <SystemTab metrics={metrics} />
            },
            {
              key: 'database',
              label: (
                <span>
                  <DatabaseOutlined />
                  Database
                </span>
              ),
              children: <DatabaseTab metrics={metrics} />
            },
            {
              key: 'scrapy',
              label: (
                <span>
                  <BugOutlined />
                  Scrapy
                </span>
              ),
              children: <ScrapyTab />
            },
            {
              key: 'api',
              label: (
                <span>
                  <ApiOutlined />
                  API
                </span>
              ),
              children: <APITab metrics={metrics} />
            },
            {
              key: 'logs',
              label: (
                <span>
                  <BugOutlined />
                  Logs
                </span>
              ),
              children: <LogsTab />
            }
          ]}
        />
      </Content>

      {/* Full Sources Modal */}
      <Modal
        title={`All Scrapy Sources (${sourceStats?.total_unique_sources || 0})`}
        open={showFullSourcesList}
        onCancel={() => setShowFullSourcesList(false)}
        width={1200}
        footer={[
          <Button key="close" onClick={() => setShowFullSourcesList(false)}>
            Close
          </Button>
        ]}
      >
        <Spin spinning={sourcesLoading}>
          <Row gutter={[16, 16]}>
            {scrapySources.map((source, index) => (
              <Col xs={24} md={12} key={index}>
                <Card size="small">
                  <Descriptions size="small" column={1}>
                    <Descriptions.Item label="Domain">
                      <Text strong>{source.domain}</Text>
                    </Descriptions.Item>
                    <Descriptions.Item label="Articles">
                      <Badge count={source.article_count} style={{ backgroundColor: '#52c41a' }} />
                    </Descriptions.Item>
                    <Descriptions.Item label="URL">
                      <Text code style={{ fontSize: '11px' }}>
                        {source.source_url}
                      </Text>
                    </Descriptions.Item>
                    <Descriptions.Item label="First Scraped">
                      {source.first_scraped ? new Date(source.first_scraped).toLocaleDateString() : 'N/A'}
                    </Descriptions.Item>
                    <Descriptions.Item label="Last Scraped">
                      {source.last_scraped ? new Date(source.last_scraped).toLocaleDateString() : 'N/A'}
                    </Descriptions.Item>
                    <Descriptions.Item label="Active Days">
                      {source.days_active}
                    </Descriptions.Item>
                  </Descriptions>
                </Card>
              </Col>
            ))}
          </Row>
        </Spin>
      </Modal>

      {/* AI Dashboard Modal */}
      <Modal
        title="AI Dashboard"
        open={showAIDashboard}
        onCancel={() => setShowAIDashboard(false)}
        width={1200}
        footer={null}
      >
        <AIDashboard />
      </Modal>
    </Layout>
  );
};

// System Tab Component with CPU and RAM Charts
const SystemTab = ({ metrics }) => {
  const [cpuHistory, setCpuHistory] = useState([]);
  const [memoryHistory, setMemoryHistory] = useState([]);

  // Update history when new metrics arrive
  useEffect(() => {
    if (metrics?.system) {
      const now = new Date();
      const system = metrics.system;
      
      // Add current CPU usage to history
      setCpuHistory(prev => {
        const newHistory = [...prev, {
          timestamp: now,
          value: system.cpu?.usage || 0
        }];
        
        // Keep only last 2 hours (120 minutes)
        const twoHoursAgo = new Date(now.getTime() - 2 * 60 * 60 * 1000);
        return newHistory.filter(item => item.timestamp > twoHoursAgo);
      });
      
      // Add current memory usage to history
      setMemoryHistory(prev => {
        const newHistory = [...prev, {
          timestamp: now,
          value: system.memory?.percentage || 0
        }];
        
        // Keep only last 2 hours (120 minutes)
        const twoHoursAgo = new Date(now.getTime() - 2 * 60 * 60 * 1000);
        return newHistory.filter(item => item.timestamp > twoHoursAgo);
      });
    }
  }, [metrics]);

  // Prepare chart data for CPU
  const cpuChartData = {
    labels: cpuHistory.map(item => item.timestamp.toLocaleTimeString()),
    datasets: [{
      label: 'CPU Usage (%)',
      data: cpuHistory.map(item => item.value),
      borderColor: '#1890ff',
      backgroundColor: 'rgba(24, 144, 255, 0.1)',
      tension: 0.4,
      fill: true
    }]
  };

  // Prepare chart data for Memory
  const memoryChartData = {
    labels: memoryHistory.map(item => item.timestamp.toLocaleTimeString()),
    datasets: [{
      label: 'RAM Usage (%)',
      data: memoryHistory.map(item => item.value),
      borderColor: '#52c41a',
      backgroundColor: 'rgba(82, 196, 26, 0.1)',
      tension: 0.4,
      fill: true
    }]
  };

  // Chart options
  const chartOptions = {
    responsive: true,
    maintainAspectRatio: false,
    plugins: {
      legend: {
        position: 'top',
      },
    },
    scales: {
      y: {
        beginAtZero: true,
        max: 100,
        ticks: {
          callback: function(value) {
            return value + '%';
          }
        }
      },
      x: {
        display: true,
        title: {
          display: true,
          text: 'Time'
        }
      }
    },
    animation: {
      duration: 300,
    }
  };

  const system = metrics?.system || {};
  const cpu = system.cpu || {};
  const memory = system.memory || {};

  return (
    <Space direction="vertical" size="large" style={{ width: '100%' }}>
      {/* Current System Metrics */}
      <Row gutter={[16, 16]}>
        <Col xs={24} sm={12} lg={6}>
          <Card title="Current CPU Usage" size="small">
            <Statistic
              value={cpu.usage || 0}
              suffix="%"
              precision={1}
              valueStyle={{ color: cpu.usage > 80 ? '#cf1322' : '#3f8600' }}
            />
            <Progress
              percent={cpu.usage || 0}
              status={cpu.usage > 80 ? 'exception' : 'active'}
              size="small"
              style={{ marginTop: 8 }}
            />
          </Card>
        </Col>
        
        <Col xs={24} sm={12} lg={6}>
          <Card title="Current RAM Usage" size="small">
            <Statistic
              value={memory.percentage || 0}
              suffix="%"
              precision={1}
              valueStyle={{ color: memory.percentage > 80 ? '#cf1322' : '#3f8600' }}
            />
            <Progress
              percent={memory.percentage || 0}
              status={memory.percentage > 80 ? 'exception' : 'active'}
              size="small"
              style={{ marginTop: 8 }}
            />
          </Card>
        </Col>
        
        <Col xs={24} sm={12} lg={6}>
          <Card title="CPU Cores" size="small">
            <Statistic
              value={cpu.cores || 0}
              prefix={<MonitorOutlined />}
              valueStyle={{ color: '#1890ff' }}
            />
          </Card>
        </Col>
        
        <Col xs={24} sm={12} lg={6}>
          <Card title="System Uptime" size="small">
            <Statistic
              value={(() => {
                const seconds = Math.floor(system.uptime || 0);
                const hours = Math.floor(seconds / 3600);
                const minutes = Math.floor((seconds % 3600) / 60);
                return `${hours}h ${minutes}m`;
              })()}
              prefix={<ClockCircleOutlined />}
              valueStyle={{ color: '#722ed1' }}
            />
          </Card>
        </Col>
      </Row>

      {/* Charts */}
      <Row gutter={[16, 16]}>
        <Col xs={24} lg={12}>
          <Card title="CPU Usage - Last 2 Hours" size="small">
            <div style={{ height: '300px' }}>
              <Line data={cpuChartData} options={chartOptions} />
            </div>
          </Card>
        </Col>
        
        <Col xs={24} lg={12}>
          <Card title="RAM Usage - Last 2 Hours" size="small">
            <div style={{ height: '300px' }}>
              <Line data={memoryChartData} options={chartOptions} />
            </div>
          </Card>
        </Col>
      </Row>
    </Space>
  );
};

// API Tab Component
const APITab = ({ metrics }) => {
  const [requestHistory, setRequestHistory] = useState([]);
  const [responseTimeHistory, setResponseTimeHistory] = useState([]);
  const [showRequestsModal, setShowRequestsModal] = useState(false);
  const [apiRequestsList, setApiRequestsList] = useState([]);

  // Update history when new metrics arrive
  useEffect(() => {
    if (metrics?.http) {
      const now = new Date();
      const http = metrics.http;
      
      // Add current request count to history
      setRequestHistory(prev => {
        const newHistory = [...prev, {
          timestamp: now,
          total: http.requests?.total || 0,
          active: http.requests?.active || 0,
          errors: http.requests?.errors || 0
        }];
        
        // Keep only last 2 hours
        const twoHoursAgo = new Date(now.getTime() - 2 * 60 * 60 * 1000);
        return newHistory.filter(item => item.timestamp > twoHoursAgo);
      });
      
      // Add current response time to history
      setResponseTimeHistory(prev => {
        const newHistory = [...prev, {
          timestamp: now,
          value: http.requests?.avgResponseTime || 0
        }];
        
        // Keep only last 2 hours
        const twoHoursAgo = new Date(now.getTime() - 2 * 60 * 60 * 1000);
        return newHistory.filter(item => item.timestamp > twoHoursAgo);
      });
    }
  }, [metrics]);

  // Fetch API requests list
  const fetchAPIRequests = async () => {
    try {
      const response = await fetch('http://localhost:8080/api/monitor/requests');
      if (response.ok) {
        const data = await response.json();
        setApiRequestsList(data.requests || []);
      }
    } catch (error) {
      console.error('Failed to fetch API requests:', error);
    }
  };

  // Prepare chart data for API Requests
  const requestsChartData = {
    labels: requestHistory.map(item => item.timestamp.toLocaleTimeString()),
    datasets: [
      {
        label: 'Total Requests',
        data: requestHistory.map(item => item.total),
        borderColor: '#1890ff',
        backgroundColor: 'rgba(24, 144, 255, 0.1)',
        tension: 0.4,
        fill: false
      },
      {
        label: 'Active Requests',
        data: requestHistory.map(item => item.active),
        borderColor: '#52c41a',
        backgroundColor: 'rgba(82, 196, 26, 0.1)',
        tension: 0.4,
        fill: false
      },
      {
        label: 'Errors',
        data: requestHistory.map(item => item.errors),
        borderColor: '#ff4d4f',
        backgroundColor: 'rgba(255, 77, 79, 0.1)',
        tension: 0.4,
        fill: false
      }
    ]
  };

  // Prepare chart data for Response Time
  const responseTimeChartData = {
    labels: responseTimeHistory.map(item => item.timestamp.toLocaleTimeString()),
    datasets: [{
      label: 'Average Response Time (ms)',
      data: responseTimeHistory.map(item => item.value),
      borderColor: '#722ed1',
      backgroundColor: 'rgba(114, 46, 209, 0.1)',
      tension: 0.4,
      fill: true
    }]
  };

  // Chart options for requests
  const requestsChartOptions = {
    responsive: true,
    maintainAspectRatio: false,
    plugins: {
      legend: {
        position: 'top',
      },
    },
    scales: {
      y: {
        beginAtZero: true,
        title: {
          display: true,
          text: 'Number of Requests'
        }
      },
      x: {
        display: true,
        title: {
          display: true,
          text: 'Time'
        }
      }
    },
    animation: {
      duration: 300,
    }
  };

  // Chart options for response time
  const responseTimeChartOptions = {
    responsive: true,
    maintainAspectRatio: false,
    plugins: {
      legend: {
        position: 'top',
      },
    },
    scales: {
      y: {
        beginAtZero: true,
        title: {
          display: true,
          text: 'Response Time (ms)'
        }
      },
      x: {
        display: true,
        title: {
          display: true,
          text: 'Time'
        }
      }
    },
    animation: {
      duration: 300,
    }
  };

  const http = metrics?.http || {};
  const requests = http.requests || {};
  const responses = http.responses || {};

  // Calculate success rate
  const successRate = requests.total > 0 
    ? Math.round(((responses.success || 0) / requests.total) * 100)
    : 100;

  // Get route statistics
  const routeStats = [];
  if (http.routes && typeof http.routes.forEach === 'function') {
    http.routes.forEach((stats, route) => {
      routeStats.push({
        route,
        requests: stats.requests || 0,
        errors: stats.errors || 0,
        avgTime: Math.round(stats.avgTime || 0),
        errorRate: stats.requests > 0 ? Math.round((stats.errors / stats.requests) * 100) : 0
      });
    });
  }

  // Sort routes by request count
  routeStats.sort((a, b) => b.requests - a.requests);

  return (
    <Space direction="vertical" size="large" style={{ width: '100%' }}>
      {/* Current API Metrics */}
      <Row gutter={[16, 16]}>
        <Col xs={24} sm={12} lg={6}>
          <Card 
            title="Total Requests" 
            size="small"
            hoverable
            onClick={() => {
              setShowRequestsModal(true);
              fetchAPIRequests();
            }}
            style={{ cursor: 'pointer' }}
          >
            <Statistic
              value={requests.total || 0}
              prefix={<ApiOutlined />}
              valueStyle={{ color: '#1890ff' }}
            />
            <Text type="secondary" style={{ fontSize: '12px' }}>
              <EyeOutlined /> Click to view requests details
            </Text>
          </Card>
        </Col>
        
        <Col xs={24} sm={12} lg={6}>
          <Card title="Active Requests" size="small">
            <Statistic
              value={requests.active || 0}
              prefix={<GlobalOutlined />}
              valueStyle={{ color: requests.active > 10 ? '#ff4d4f' : '#52c41a' }}
            />
            <Text type="secondary" style={{ fontSize: '12px' }}>
              Currently processing
            </Text>
          </Card>
        </Col>
        
        <Col xs={24} sm={12} lg={6}>
          <Card title="Error Rate" size="small">
            <Statistic
              value={requests.total > 0 ? Math.round(((requests.errors || 0) / requests.total) * 100) : 0}
              suffix="%"
              precision={1}
              valueStyle={{ color: (requests.errors || 0) > 0 ? '#ff4d4f' : '#52c41a' }}
              prefix={<ExclamationCircleOutlined />}
            />
            <Text type="secondary" style={{ fontSize: '12px' }}>
              {requests.errors || 0} total errors
            </Text>
          </Card>
        </Col>
        
        <Col xs={24} sm={12} lg={6}>
          <Card title="Avg Response Time" size="small">
            <Statistic
              value={Math.round(requests.avgResponseTime || 0)}
              suffix="ms"
              precision={0}
              valueStyle={{ 
                color: (requests.avgResponseTime || 0) > 1000 ? '#ff4d4f' : 
                       (requests.avgResponseTime || 0) > 500 ? '#fa8c16' : '#52c41a' 
              }}
              prefix={<ClockCircleOutlined />}
            />
            <Text type="secondary" style={{ fontSize: '12px' }}>
              Average processing time
            </Text>
          </Card>
        </Col>
      </Row>

      {/* Success Rate Progress */}
      <Row gutter={[16, 16]}>
        <Col xs={24} lg={12}>
          <Card title="API Success Rate" size="small">
            <Progress
              type="dashboard"
              percent={successRate}
              status={successRate >= 95 ? 'success' : successRate >= 90 ? 'normal' : 'exception'}
              format={percent => `${percent}%`}
            />
            <div style={{ textAlign: 'center', marginTop: '16px' }}>
              <Text type="secondary">
                {responses.success || 0} successful / {requests.total || 0} total requests
              </Text>
            </div>
          </Card>
        </Col>
        
        <Col xs={24} lg={12}>
          <Card title="Response Status Distribution" size="small">
            <Space direction="vertical" style={{ width: '100%' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <Text>Success (2xx)</Text>
                <Badge count={responses.success || 0} style={{ backgroundColor: '#52c41a' }} />
              </div>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <Text>Errors (4xx/5xx)</Text>
                <Badge count={responses.error || 0} style={{ backgroundColor: '#ff4d4f' }} />
              </div>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <Text>Pending</Text>
                <Badge count={responses.pending || 0} style={{ backgroundColor: '#1890ff' }} />
              </div>
            </Space>
          </Card>
        </Col>
      </Row>

      {/* Charts */}
      <Row gutter={[16, 16]}>
        <Col xs={24} lg={12}>
          <Card title="API Requests - Last 2 Hours" size="small">
            <div style={{ height: '300px' }}>
              <Line data={requestsChartData} options={requestsChartOptions} />
            </div>
          </Card>
        </Col>
        
        <Col xs={24} lg={12}>
          <Card title="Response Time - Last 2 Hours" size="small">
            <div style={{ height: '300px' }}>
              <Line data={responseTimeChartData} options={responseTimeChartOptions} />
            </div>
          </Card>
        </Col>
      </Row>

      {/* Route Statistics */}
      {routeStats.length > 0 && (
        <Card title="API Routes Performance" size="small">
          <Table
            dataSource={routeStats.slice(0, 10)} // Show top 10 routes
            columns={[
              {
                title: 'Route',
                dataIndex: 'route',
                key: 'route',
                render: (text) => <Text code style={{ fontSize: '12px' }}>{text}</Text>
              },
              {
                title: 'Requests',
                dataIndex: 'requests',
                key: 'requests',
                render: (count) => <Badge count={count} style={{ backgroundColor: '#1890ff' }} />
              },
              {
                title: 'Errors',
                dataIndex: 'errors',
                key: 'errors',
                render: (count) => <Badge count={count} style={{ backgroundColor: count > 0 ? '#ff4d4f' : '#52c41a' }} />
              },
              {
                title: 'Error Rate',
                dataIndex: 'errorRate',
                key: 'errorRate',
                render: (rate) => (
                  <Text style={{ color: rate > 5 ? '#ff4d4f' : rate > 1 ? '#fa8c16' : '#52c41a' }}>
                    {rate}%
                  </Text>
                )
              },
              {
                title: 'Avg Time',
                dataIndex: 'avgTime',
                key: 'avgTime',
                render: (time) => (
                  <Text style={{ color: time > 1000 ? '#ff4d4f' : time > 500 ? '#fa8c16' : '#52c41a' }}>
                    {time}ms
                  </Text>
                )
              }
            ]}
            pagination={false}
            size="small"
          />
        </Card>
      )}

      {/* API Requests Modal */}
      <Modal
        title={`API Requests History (${apiRequestsList.length} total)`}
        open={showRequestsModal}
        onCancel={() => setShowRequestsModal(false)}
        width={1400}
        footer={[
          <Button key="refresh" onClick={fetchAPIRequests} icon={<ReloadOutlined />}>
            Refresh
          </Button>,
          <Button key="close" onClick={() => setShowRequestsModal(false)}>
            Close
          </Button>
        ]}
      >
        <Table
          dataSource={apiRequestsList}
          columns={[
            {
              title: 'Time',
              dataIndex: 'timestamp',
              key: 'timestamp',
              width: 120,
              render: (timestamp) => new Date(timestamp).toLocaleTimeString(),
              sorter: (a, b) => new Date(b.timestamp) - new Date(a.timestamp),
              defaultSortOrder: 'descend'
            },
            {
              title: 'Method',
              dataIndex: 'method',
              key: 'method',
              width: 80,
              render: (method) => (
                <Tag color={
                  method === 'GET' ? 'blue' :
                  method === 'POST' ? 'green' :
                  method === 'PUT' ? 'orange' :
                  method === 'DELETE' ? 'red' : 'default'
                }>
                  {method}
                </Tag>
              )
            },
            {
              title: 'URL',
              dataIndex: 'url',
              key: 'url',
              render: (url) => <Text code style={{ fontSize: '11px' }}>{url}</Text>,
              ellipsis: true
            },
            {
              title: 'Status',
              dataIndex: 'statusCode',
              key: 'statusCode',
              width: 80,
              render: (status) => (
                <Tag color={
                  status >= 200 && status < 300 ? 'success' :
                  status >= 300 && status < 400 ? 'warning' :
                  status >= 400 && status < 500 ? 'error' :
                  status >= 500 ? 'error' : 'default'
                }>
                  {status}
                </Tag>
              )
            },
            {
              title: 'Duration',
              dataIndex: 'duration',
              key: 'duration',
              width: 100,
              render: (duration) => (
                <Text style={{ 
                  color: duration > 1000 ? '#ff4d4f' : 
                         duration > 500 ? '#fa8c16' : '#52c41a' 
                }}>
                  {duration}ms
                </Text>
              ),
              sorter: (a, b) => a.duration - b.duration
            },
            {
              title: 'IP',
              dataIndex: 'ip',
              key: 'ip',
              width: 120,
              render: (ip) => <Text type="secondary" style={{ fontSize: '11px' }}>{ip}</Text>
            },
            {
              title: 'User Agent',
              dataIndex: 'userAgent',
              key: 'userAgent',
              ellipsis: true,
              render: (userAgent) => <Text type="secondary" style={{ fontSize: '10px' }}>{userAgent}</Text>
            }
          ]}
          pagination={{
            pageSize: 20,
            showSizeChanger: true,
            showQuickJumper: true,
            showTotal: (total, range) => `${range[0]}-${range[1]} of ${total} requests`
          }}
          size="small"
          scroll={{ y: 400 }}
        />
      </Modal>
    </Space>
  );
};

// Database Tab Component
const DatabaseTab = ({ metrics }) => {
  const [queryHistory, setQueryHistory] = useState([]);
  const [responseTimeHistory, setResponseTimeHistory] = useState([]);
  const [showQueriesModal, setShowQueriesModal] = useState(false);
  const [databaseQueries, setDatabaseQueries] = useState([]);

  // Update history when new metrics arrive
  useEffect(() => {
    if (metrics?.database) {
      const now = new Date();
      const database = metrics.database;
      
      // Add current query metrics to history
      setQueryHistory(prev => {
        const newHistory = [...prev, {
          timestamp: now,
          total: database.queries?.total || 0,
          active: database.queries?.active || 0, 
          errors: database.queries?.errors || 0
        }];
        
        // Keep only last 2 hours
        const twoHoursAgo = new Date(now.getTime() - 2 * 60 * 60 * 1000);
        return newHistory.filter(item => item.timestamp > twoHoursAgo);
      });
      
      // Add current response time to history
      setResponseTimeHistory(prev => {
        const newHistory = [...prev, {
          timestamp: now,
          value: database.queries?.avgTime || 0
        }];
        
        // Keep only last 2 hours
        const twoHoursAgo = new Date(now.getTime() - 2 * 60 * 60 * 1000);
        return newHistory.filter(item => item.timestamp > twoHoursAgo);
      });
    }
  }, [metrics]);

  // Fetch database queries
  const fetchDatabaseQueries = async () => {
    try {
      const response = await fetch('http://localhost:8080/api/monitor/database-queries');
      if (response.ok) {
        const data = await response.json();
        setDatabaseQueries(data.queries || []);
      }
    } catch (error) {
      console.error('Failed to fetch database queries:', error);
    }
  };

  // Prepare chart data for Database Queries
  const queriesChartData = {
    labels: queryHistory.map(item => item.timestamp.toLocaleTimeString()),
    datasets: [
      {
        label: 'Total Queries',
        data: queryHistory.map(item => item.total),
        borderColor: '#1890ff',
        backgroundColor: 'rgba(24, 144, 255, 0.1)',
        tension: 0.4,
        fill: false
      },
      {
        label: 'Active Queries',
        data: queryHistory.map(item => item.active),
        borderColor: '#52c41a',
        backgroundColor: 'rgba(82, 196, 26, 0.1)',
        tension: 0.4,
        fill: false
      },
      {
        label: 'Errors',
        data: queryHistory.map(item => item.errors),
        borderColor: '#ff4d4f',
        backgroundColor: 'rgba(255, 77, 79, 0.1)',
        tension: 0.4,
        fill: false
      }
    ]
  };

  // Prepare chart data for Response Time
  const responseTimeChartData = {
    labels: responseTimeHistory.map(item => item.timestamp.toLocaleTimeString()),
    datasets: [{
      label: 'Average Query Time (ms)',
      data: responseTimeHistory.map(item => item.value),
      borderColor: '#722ed1',
      backgroundColor: 'rgba(114, 46, 209, 0.1)',
      tension: 0.4,
      fill: true
    }]
  };

  // Chart options
  const chartOptions = {
    responsive: true,
    maintainAspectRatio: false,
    plugins: {
      legend: {
        position: 'top',
      },
    },
    scales: {
      y: {
        beginAtZero: true,
        title: {
          display: true,
          text: 'Count / Time (ms)'
        }
      },
      x: {
        display: true,
        title: {
          display: true,
          text: 'Time'
        }
      }
    },
    animation: {
      duration: 300,
    }
  };

  const database = metrics?.database || {};
  const queries = database.queries || {};
  const operations = database.operations || {};

  return (
    <Space direction="vertical" size="large" style={{ width: '100%' }}>
      {/* Database Status */}
      <Row gutter={[16, 16]}>
        <Col xs={24} sm={12} lg={6}>
          <Card title="Connection Status" size="small">
            <div style={{ textAlign: 'center' }}>
              <Badge 
                status={database.connected ? "success" : "error"} 
                text={database.connected ? "Connected" : "Disconnected"}
                style={{ fontSize: '16px' }}
              />
              <div style={{ marginTop: '8px' }}>
                <Text type="secondary" style={{ fontSize: '12px' }}>
                  SQLite Database
                </Text>
              </div>
            </div>
          </Card>
        </Col>

        <Col xs={24} sm={12} lg={6}>
          <Card 
            title="Total Queries" 
            size="small"
            hoverable
            onClick={() => {
              setShowQueriesModal(true);
              fetchDatabaseQueries();
            }}
            style={{ cursor: 'pointer' }}
          >
            <Statistic
              value={queries.total || 0}
              prefix={<DatabaseOutlined />}
              valueStyle={{ color: '#1890ff' }}
            />
            <Text type="secondary" style={{ fontSize: '12px' }}>
              <EyeOutlined /> Click to view query details
            </Text>
          </Card>
        </Col>
        
        <Col xs={24} sm={12} lg={6}>
          <Card title="Active Queries" size="small">
            <Statistic
              value={queries.active || 0}
              prefix={<GlobalOutlined />}
              valueStyle={{ color: queries.active > 5 ? '#ff4d4f' : '#52c41a' }}
            />
            <Text type="secondary" style={{ fontSize: '12px' }}>
              Currently executing
            </Text>
          </Card>
        </Col>
        
        <Col xs={24} sm={12} lg={6}>
          <Card title="Query Errors" size="small">
            <Statistic
              value={queries.errors || 0}
              prefix={<ExclamationCircleOutlined />}
              valueStyle={{ color: (queries.errors || 0) > 0 ? '#ff4d4f' : '#52c41a' }}
            />
            <Text type="secondary" style={{ fontSize: '12px' }}>
              Total failed queries
            </Text>
          </Card>
        </Col>
      </Row>

      {/* Performance Metrics */}
      <Row gutter={[16, 16]}>
        <Col xs={24} sm={12} lg={8}>
          <Card title="Average Query Time" size="small">
            <Statistic
              value={Math.round((queries.avgTime || 0) * 100) / 100}
              suffix="ms"
              precision={2}
              valueStyle={{ 
                color: (queries.avgTime || 0) > 100 ? '#ff4d4f' : 
                       (queries.avgTime || 0) > 50 ? '#fa8c16' : '#52c41a' 
              }}
              prefix={<ClockCircleOutlined />}
            />
            <Text type="secondary" style={{ fontSize: '12px' }}>
              Response time performance
            </Text>
          </Card>
        </Col>
        
        <Col xs={24} sm={12} lg={8}>
          <Card title="Query Success Rate" size="small">
            <Progress
              type="dashboard"
              percent={queries.total > 0 
                ? Math.round(((queries.total - (queries.errors || 0)) / queries.total) * 100)
                : 100
              }
              status={
                queries.errors === 0 ? 'success' : 
                (queries.errors || 0) / (queries.total || 1) < 0.05 ? 'normal' : 'exception'
              }
              format={percent => `${percent}%`}
            />
            <div style={{ textAlign: 'center', marginTop: '8px' }}>
              <Text type="secondary" style={{ fontSize: '12px' }}>
                {(queries.total || 0) - (queries.errors || 0)} successful / {queries.total || 0} total
              </Text>
            </div>
          </Card>
        </Col>
        
        <Col xs={24} sm={12} lg={8}>
          <Card title="Database Size" size="small">
            <Statistic
              value="745"
              suffix="KB"
              valueStyle={{ color: '#1890ff' }}
              prefix={<DatabaseOutlined />}
            />
            <Text type="secondary" style={{ fontSize: '12px' }}>
              Current database file size
            </Text>
          </Card>
        </Col>
      </Row>

      {/* Query Operations */}
      <Row gutter={[16, 16]}>
        <Col xs={24} lg={12}>
          <Card title="Query Operations" size="small">
            <Space direction="vertical" style={{ width: '100%' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <Text>READ (SELECT)</Text>
                <Badge count={operations.read || 0} style={{ backgroundColor: '#52c41a' }} />
              </div>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <Text>WRITE (INSERT/UPDATE)</Text>
                <Badge count={operations.write || 0} style={{ backgroundColor: '#1890ff' }} />
              </div>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <Text>DELETE</Text>
                <Badge count={operations.delete || 0} style={{ backgroundColor: '#ff4d4f' }} />
              </div>
            </Space>
          </Card>
        </Col>
        
        <Col xs={24} lg={12}>
          <Card title="Database Tables" size="small">
            <List
              size="small"
              dataSource={[
                { name: 'news_articles', description: 'Financial news and analysis', icon: '📰' },
                { name: 'settings', description: 'Application configuration', icon: '⚙️' }
              ]}
              renderItem={item => (
                <List.Item>
                  <List.Item.Meta
                    avatar={<span style={{ fontSize: '16px' }}>{item.icon}</span>}
                    title={<Text code>{item.name}</Text>}
                    description={<Text type="secondary" style={{ fontSize: '11px' }}>{item.description}</Text>}
                  />
                </List.Item>
              )}
            />
          </Card>
        </Col>
      </Row>

      {/* Charts */}
      <Row gutter={[16, 16]}>
        <Col xs={24} lg={12}>
          <Card title="Database Queries - Last 2 Hours" size="small">
            <div style={{ height: '300px' }}>
              <Line data={queriesChartData} options={chartOptions} />
            </div>
          </Card>
        </Col>
        
        <Col xs={24} lg={12}>
          <Card title="Query Response Time - Last 2 Hours" size="small">
            <div style={{ height: '300px' }}>
              <Line data={responseTimeChartData} options={chartOptions} />
            </div>
          </Card>
        </Col>
      </Row>

      {/* Database Queries Modal */}
      <Modal
        title={`Database Query History (${databaseQueries.length} queries)`}
        open={showQueriesModal}
        onCancel={() => setShowQueriesModal(false)}
        width={1400}
        footer={[
          <Button key="refresh" onClick={fetchDatabaseQueries} icon={<ReloadOutlined />}>
            Refresh
          </Button>,
          <Button key="close" onClick={() => setShowQueriesModal(false)}>
            Close
          </Button>
        ]}
      >
        <Table
          dataSource={databaseQueries}
          columns={[
            {
              title: 'Time',
              dataIndex: 'timestamp',
              key: 'timestamp',
              width: 120,
              render: (timestamp) => new Date(timestamp).toLocaleTimeString(),
              sorter: (a, b) => new Date(b.timestamp) - new Date(a.timestamp),
              defaultSortOrder: 'descend'
            },
            {
              title: 'Type',
              dataIndex: 'type',
              key: 'type',
              width: 80,
              render: (type) => (
                <Tag color={
                  type === 'SELECT' ? 'green' :
                  type === 'INSERT' ? 'blue' :
                  type === 'UPDATE' ? 'orange' :
                  type === 'DELETE' ? 'red' : 'default'
                }>
                  {type}
                </Tag>
              )
            },
            {
              title: 'Query',
              dataIndex: 'query',
              key: 'query',
              render: (query) => <Text code style={{ fontSize: '11px' }}>{query}</Text>,
              ellipsis: true
            },
            {
              title: 'Duration',
              dataIndex: 'duration',
              key: 'duration',
              width: 100,
              render: (duration) => (
                <Text style={{ 
                  color: duration > 100 ? '#ff4d4f' : 
                         duration > 50 ? '#fa8c16' : '#52c41a' 
                }}>
                  {duration}ms
                </Text>
              ),
              sorter: (a, b) => a.duration - b.duration
            },
            {
              title: 'Status',
              dataIndex: 'error',
              key: 'status',
              width: 80,
              render: (error) => (
                <Tag color={error ? 'error' : 'success'}>
                  {error ? 'Error' : 'Success'}
                </Tag>
              )
            },
            {
              title: 'Parameters',
              dataIndex: 'params',
              key: 'params',
              render: (params) => (
                <Text type="secondary" style={{ fontSize: '10px' }}>
                  {params && params.length > 0 ? JSON.stringify(params) : 'None'}
                </Text>
              ),
              ellipsis: true
            }
          ]}
          pagination={{
            pageSize: 20,
            showSizeChanger: true,
            showQuickJumper: true,
            showTotal: (total, range) => `${range[0]}-${range[1]} of ${total} queries`
          }}
          size="small"
          scroll={{ y: 400 }}
        />
      </Modal>
    </Space>
  );
};

// Logs Tab Component for HTTP Activity Monitoring
const LogsTab = () => {
  const [httpLogs, setHttpLogs] = useState([]);
  const [loading, setLoading] = useState(false);
  const [autoRefresh, setAutoRefresh] = useState(true);
  const [filter, setFilter] = useState('all'); // all, errors, success
  const [searchTerm, setSearchTerm] = useState('');

  // Fetch HTTP logs from API
  const fetchHttpLogs = async () => {
    setLoading(true);
    try {
      const response = await fetch('http://localhost:8080/api/monitor/logs?level=INFO&limit=200&event=HTTP_REQUEST_END');
      const data = await response.json();
      
      // Transform log data to display format
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
    setLoading(false);
  };

  // Auto-refresh logs every 5 seconds
  useEffect(() => {
    fetchHttpLogs();
    
    if (autoRefresh) {
      const interval = setInterval(fetchHttpLogs, 5000);
      return () => clearInterval(interval);
    }
  }, [autoRefresh]);

  // Filter logs based on current filter and search term
  const filteredLogs = httpLogs.filter(log => {
    // Filter by status
    if (filter === 'errors' && !log.isError) return false;
    if (filter === 'success' && log.isError) return false;
    
    // Filter by search term
    if (searchTerm && !log.url.toLowerCase().includes(searchTerm.toLowerCase()) && 
        !log.method.toLowerCase().includes(searchTerm.toLowerCase()) &&
        !log.route.toLowerCase().includes(searchTerm.toLowerCase())) {
      return false;
    }
    
    return true;
  });

  // Table columns for HTTP logs
  const columns = [
    {
      title: 'Time',
      dataIndex: 'timestamp',
      key: 'timestamp',
      width: 100,
      render: (timestamp) => timestamp.toLocaleTimeString(),
      sorter: (a, b) => a.timestamp - b.timestamp,
      defaultSortOrder: 'descend'
    },
    {
      title: 'Method',
      dataIndex: 'method',
      key: 'method',
      width: 80,
      render: (method) => (
        <Tag color={
          method === 'GET' ? 'green' : 
          method === 'POST' ? 'blue' : 
          method === 'PUT' ? 'orange' : 
          method === 'DELETE' ? 'red' : 'default'
        }>
          {method}
        </Tag>
      ),
      filters: [
        { text: 'GET', value: 'GET' },
        { text: 'POST', value: 'POST' },
        { text: 'PUT', value: 'PUT' },
        { text: 'DELETE', value: 'DELETE' }
      ],
      onFilter: (value, record) => record.method === value
    },
    {
      title: 'Status',
      dataIndex: 'statusCode',
      key: 'statusCode',
      width: 80,
      render: (statusCode) => (
        <Badge
          status={statusCode >= 400 ? 'error' : statusCode >= 300 ? 'warning' : 'success'}
          text={statusCode}
        />
      ),
      sorter: (a, b) => a.statusCode - b.statusCode
    },
    {
      title: 'URL',
      dataIndex: 'url',
      key: 'url',
      ellipsis: true,
      render: (url) => (
        <Tooltip title={url}>
          <Text code style={{ fontSize: '12px' }}>{url}</Text>
        </Tooltip>
      )
    },
    {
      title: 'Duration',
      dataIndex: 'duration',
      key: 'duration',
      width: 90,
      render: (duration) => (
        <Text style={{ 
          color: duration > 1000 ? '#ff4d4f' : duration > 500 ? '#faad14' : '#52c41a' 
        }}>
          {duration}ms
        </Text>
      ),
      sorter: (a, b) => a.duration - b.duration
    },
    {
      title: 'Size',
      dataIndex: 'responseSize',
      key: 'responseSize',
      width: 80,
      render: (size) => size > 0 ? `${(size / 1024).toFixed(1)}KB` : '-'
    },
    {
      title: 'IP',
      dataIndex: 'ip',
      key: 'ip',
      width: 120,
      ellipsis: true
    }
  ];

  return (
    <Space direction="vertical" size="large" style={{ width: '100%' }}>
      {/* Header with controls */}
      <Row gutter={[16, 16]} align="middle">
        <Col xs={24} sm={8}>
          <Card size="small">
            <Statistic
              title="Total HTTP Requests"
              value={httpLogs.length}
              prefix={<ApiOutlined />}
              valueStyle={{ color: '#1890ff' }}
            />
          </Card>
        </Col>
        <Col xs={24} sm={8}>
          <Card size="small">
            <Statistic
              title="Error Requests"
              value={httpLogs.filter(log => log.isError).length}
              prefix={<ExclamationCircleOutlined />}
              valueStyle={{ 
                color: httpLogs.filter(log => log.isError).length > 0 ? '#ff4d4f' : '#52c41a'
              }}
            />
          </Card>
        </Col>
        <Col xs={24} sm={8}>
          <Card size="small">
            <Statistic
              title="Success Rate"
              value={httpLogs.length > 0 ? 
                (((httpLogs.length - httpLogs.filter(log => log.isError).length) / httpLogs.length) * 100).toFixed(1) : 100
              }
              suffix="%"
              prefix={<CheckCircleOutlined />}
              valueStyle={{ color: '#52c41a' }}
            />
          </Card>
        </Col>
      </Row>

      {/* Filter and search controls */}
      <Row gutter={[16, 16]} align="middle">
        <Col xs={24} sm={6}>
          <Button.Group>
            <Button 
              type={filter === 'all' ? 'primary' : 'default'}
              onClick={() => setFilter('all')}
              size="small"
            >
              All
            </Button>
            <Button 
              type={filter === 'success' ? 'primary' : 'default'}
              onClick={() => setFilter('success')}
              size="small"
            >
              Success
            </Button>
            <Button 
              type={filter === 'errors' ? 'primary' : 'default'}
              onClick={() => setFilter('errors')}
              size="small"
            >
              Errors
            </Button>
          </Button.Group>
        </Col>
        <Col xs={24} sm={8}>
          <input
            placeholder="Search URL, method, or route..."
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            style={{
              width: '100%',
              padding: '4px 8px',
              border: '1px solid #d9d9d9',
              borderRadius: '4px',
              fontSize: '12px'
            }}
          />
        </Col>
        <Col xs={24} sm={10} style={{ textAlign: 'right' }}>
          <Space>
            <Button
              icon={<ReloadOutlined />}
              onClick={fetchHttpLogs}
              loading={loading}
              size="small"
            >
              Refresh
            </Button>
            <Button
              type={autoRefresh ? 'primary' : 'default'}
              icon={<SyncOutlined spin={autoRefresh} />}
              onClick={() => setAutoRefresh(!autoRefresh)}
              size="small"
            >
              Auto Refresh
            </Button>
          </Space>
        </Col>
      </Row>

      {/* HTTP Logs Table */}
      <Table
        columns={columns}
        dataSource={filteredLogs}
        rowKey="id"
        loading={loading}
        pagination={{
          pageSize: 50,
          showSizeChanger: true,
          showQuickJumper: true,
          showTotal: (total, range) => `${range[0]}-${range[1]} of ${total} requests`
        }}
        size="small"
        scroll={{ y: 600 }}
        rowClassName={(record) => record.isError ? 'error-row' : ''}
      />

      <style jsx>{`
        .error-row {
          background-color: #fff2f0 !important;
        }
        .error-row:hover {
          background-color: #ffccc7 !important;
        }
      `}</style>
    </Space>
  );
};

export default MonitoringDashboard;