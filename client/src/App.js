import React, { useState, useEffect } from 'react';
import { Layout, ConfigProvider, theme } from 'antd';
import { io } from 'socket.io-client';
import SetupModal from './components/SetupModal.antd';
import MonitoringDashboard from './components/MonitoringDashboard.antd';
import AIDashboard from './components/AIDashboard.antd';
import LiveFeedAntd from './components/LiveFeedAntd';
import { antdTheme } from './theme/theme';
import { processThemeAlgorithm } from './theme/themeUtils';
import axios from 'axios';

const { Content } = Layout;

// Tema este acum importată din fișierul dedicat theme/theme.js
// Pentru a edita tema, folosește Theme Editor de la ant.design

function App() {
  // Procesează tema pentru a converti string algorithm în funcție
  const processedTheme = processThemeAlgorithm(antdTheme, theme);
  const [news, setNews] = useState([]);
  const [loading, setLoading] = useState(true);
  const [showSetup, setShowSetup] = useState(false);
  const [hasApiKey, setHasApiKey] = useState(false);
  const [stats, setStats] = useState(null);
  const [showMonitoring, setShowMonitoring] = useState(false);
  const [showAIDashboard, setShowAIDashboard] = useState(false);
  const [socket, setSocket] = useState(null);

  useEffect(() => {
    checkSetupStatus();
  }, []);

  useEffect(() => {
    if (hasApiKey) {
      loadNews();
      loadStats();

      // Connect to monitoring WebSocket
      const newSocket = io('http://localhost:8080');
      setSocket(newSocket);

      // Refresh stats every 30 seconds
      const interval = setInterval(() => {
        loadStats();

        // Notify monitoring about frontend refresh
        if (newSocket) {
          newSocket.emit('frontend-refresh');
        }
      }, 30000);

      return () => {
        clearInterval(interval);
        if (newSocket) {
          newSocket.disconnect();
        }
      };
    }
  }, [hasApiKey]);

  const checkSetupStatus = async () => {
    try {
      const response = await axios.get('http://localhost:8080/api/setup-status');
      const hasKey = response.data.hasApiKey;
      setHasApiKey(hasKey);
      setShowSetup(!hasKey);
      if (!hasKey) {
        setLoading(false);
      }
    } catch (error) {
      console.error('Error checking setup status:', error);
      setLoading(false);
    }
  };

  const loadNews = async () => {
    try {
      setLoading(true);
      console.log('🔄 Loading news...');
      const response = await axios.get('http://localhost:8080/api/news?limit=50');
      console.log(`📰 Loaded ${response.data.length} articles:`, response.data);
      setNews(response.data);
      console.log('📰 News state updated with:', response.data.length, 'articles');
    } catch (error) {
      console.error('Error loading news:', error);
    } finally {
      setLoading(false);
    }
  };

  const loadStats = async () => {
    try {
      const response = await axios.get('http://localhost:8080/api/stats');
      setStats(response.data);
    } catch (error) {
      console.error('Error loading stats:', error);
    }
  };

  const handleSetupComplete = () => {
    setShowSetup(false);
    setHasApiKey(true);
  };

  const triggerNewsCollection = async () => {
    try {
      await axios.post('http://localhost:8080/api/collect-news');
      setTimeout(() => {
        loadNews();
        loadStats();
      }, 2000);
    } catch (error) {
      console.error('Error triggering news collection:', error);
    }
  };

  if (showSetup) {
    return (
      <ConfigProvider theme={antdTheme}>
        <SetupModal onComplete={handleSetupComplete} />
      </ConfigProvider>
    );
  }

  return (
    <ConfigProvider theme={processedTheme}>
      <div className="min-h-screen bg-gradient-to-br from-slate-50 to-slate-100">
        <LiveFeedAntd 
          initialNews={news} 
          hasApiKey={hasApiKey}
          stats={stats}
          onRefresh={triggerNewsCollection}
          onSettings={() => setShowSetup(true)}
          onMonitoring={() => setShowMonitoring(true)}
          onAIDashboard={() => setShowAIDashboard(true)}
        />
        
        {showMonitoring && (
          <div className="fixed inset-0 z-50 bg-black bg-opacity-50 flex items-center justify-center">
            <div className="w-full h-full">
              <MonitoringDashboard onClose={() => setShowMonitoring(false)} />
            </div>
          </div>
        )}

        {showAIDashboard && (
          <AIDashboard onClose={() => setShowAIDashboard(false)} />
        )}
      </div>
    </ConfigProvider>
  );
}

export default App;