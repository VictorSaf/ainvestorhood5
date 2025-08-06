import React, { useState, useEffect } from 'react';
import { io } from 'socket.io-client';
import SetupModal from './components/SetupModal';
import MonitoringDashboard from './components/MonitoringDashboard';
import AIDashboard from './components/AIDashboard';
import LiveFeed from './components/LiveFeed';
import EditModeToolbar from './components/EditModeToolbar';
import { EditModeProvider } from './hooks/useEditMode';
import { Layout } from './components/ui';
import axios from 'axios';

function App() {
  const [news, setNews] = useState([]);
  const [loading, setLoading] = useState(true);
  const [showSetup, setShowSetup] = useState(false);
  const [hasApiKey, setHasApiKey] = useState(false);
  const [showMonitoring, setShowMonitoring] = useState(false);
  const [showAIDashboard, setShowAIDashboard] = useState(false);
  const [socket, setSocket] = useState(null);

  useEffect(() => {
    checkSetupStatus();
  }, []);

  useEffect(() => {
    if (hasApiKey) {
      loadNews();

      // Connect to monitoring WebSocket - use same origin for Docker compatibility
      const newSocket = io();
      setSocket(newSocket);

      // Refresh news every 30 seconds
      const interval = setInterval(() => {
        loadNews();

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


  const handleSetupComplete = () => {
    setShowSetup(false);
    setHasApiKey(true);
  };

  const triggerNewsCollection = async () => {
    try {
      await axios.post('http://localhost:8080/api/collect-news');
      setTimeout(() => {
        loadNews();
      }, 2000);
    } catch (error) {
      console.error('Error triggering news collection:', error);
    }
  };

  if (showSetup) {
    return <SetupModal onComplete={handleSetupComplete} />;
  }

  return (
    <EditModeProvider>
      <Layout className="min-h-screen bg-gradient-to-br from-slate-50 to-slate-100">
        <EditModeToolbar />
        
        <LiveFeed 
          initialNews={news} 
          hasApiKey={hasApiKey}
          onRefresh={triggerNewsCollection}
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
      </Layout>
    </EditModeProvider>
  );
}

export default App;