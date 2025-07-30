import React, { useState, useEffect } from 'react';
import { Layout, ConfigProvider, theme, Spin, Result, Button } from 'antd';
import { ReloadOutlined } from '@ant-design/icons';
import MonitoringDashboard from './components/MonitoringDashboard.antd';
import SetupModal from './components/SetupModal';
import ModernNewsCard from './components/ModernNewsCard';
import io from 'socket.io-client';
import './App.css';

const { Content } = Layout;

// Ant Design theme configuration
const antdTheme = {
  algorithm: theme.defaultAlgorithm,
  token: {
    colorPrimary: '#1890ff',
    colorSuccess: '#52c41a',
    colorWarning: '#faad14',
    colorError: '#f5222d',
    colorInfo: '#1890ff',
    borderRadius: 6,
    wireframe: false,
  },
  components: {
    Layout: {
      bodyBg: '#f0f2f5',
      headerBg: '#ffffff',
      siderBg: '#ffffff',
    },
    Card: {
      borderRadius: 8,
      boxShadow: '0 2px 8px rgba(0,0,0,0.06)',
    },
    Button: {
      borderRadius: 6,
    },
    Input: {
      borderRadius: 6,
    },
    Select: {
      borderRadius: 6,
    },
    Modal: {
      borderRadius: 8,
    },
    Table: {
      borderRadius: 6,
    }
  }
};

function App() {
  const [setupStatus, setSetupStatus] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [showSetup, setShowSetup] = useState(false);
  const [articles, setArticles] = useState([]);
  const [newArticlesCount, setNewArticlesCount] = useState(0);

  // Check setup status on mount
  useEffect(() => {
    checkSetupStatus();
  }, []);

  const checkSetupStatus = async () => {
    try {
      setLoading(true);
      setError(null);
      
      const response = await fetch('http://localhost:8080/api/setup-status');
      
      if (!response.ok) {
        throw new Error(`HTTP error! status: ${response.status}`);
      }
      
      const data = await response.json();
      setSetupStatus(data);
      
      if (!data.hasConfig) {
        setShowSetup(true);
      }
    } catch (error) {
      console.error('Error checking setup status:', error);
      setError(error.message);
    } finally {
      setLoading(false);
    }
  };

  const handleSetupComplete = async () => {
    setShowSetup(false);
    await checkSetupStatus();
  };

  // Loading state
  if (loading) {
    return (
      <ConfigProvider theme={antdTheme}>
        <Layout style={{ minHeight: '100vh' }}>
          <Content 
            style={{ 
              display: 'flex', 
              justifyContent: 'center', 
              alignItems: 'center',
              flexDirection: 'column',
              gap: 16
            }}
          >
            <Spin size="large" />
            <div style={{ textAlign: 'center' }}>
              <h3>Loading AIInvestorHood5...</h3>
              <p>Checking system status...</p>
            </div>
          </Content>
        </Layout>
      </ConfigProvider>
    );
  }

  // Error state
  if (error) {
    return (
      <ConfigProvider theme={antdTheme}>
        <Layout style={{ minHeight: '100vh' }}>
          <Content style={{ padding: '50px' }}>
            <Result
              status="error"
              title="Connection Error"
              subTitle={`Failed to connect to AIInvestorHood5 server: ${error}`}
              extra={[
                <Button 
                  type="primary" 
                  key="retry" 
                  icon={<ReloadOutlined />}
                  onClick={checkSetupStatus}
                >
                  Retry Connection
                </Button>
              ]}
            />
          </Content>
        </Layout>
      </ConfigProvider>
    );
  }

  // Setup required state
  if (!setupStatus?.hasConfig) {
    return (
      <ConfigProvider theme={antdTheme}>
        <Layout style={{ minHeight: '100vh' }}>
          <Content style={{ padding: '50px' }}>
            <Result
              status="warning"
              title="Setup Required"
              subTitle="AIInvestorHood5 needs to be configured before you can use it."
              extra={[
                <Button 
                  type="primary" 
                  key="setup"
                  onClick={() => setShowSetup(true)}
                >
                  Start Setup
                </Button>
              ]}
            />
            <SetupModal 
              visible={showSetup}
              onClose={handleSetupComplete}
            />
          </Content>
        </Layout>
      </ConfigProvider>
    );
  }

  // Main application
  return (
    <ConfigProvider theme={antdTheme}>
      <div className="App">
        <MonitoringDashboard />
        
        {/* Setup Modal */}
        <SetupModal 
          visible={showSetup}
          onClose={handleSetupComplete}
        />
      </div>
    </ConfigProvider>
  );
}

export default App;