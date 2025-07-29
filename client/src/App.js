import React, { useState, useEffect } from 'react';
import { io } from 'socket.io-client';
import './App.css';
import Header from './components/Header';
import NewsCard from './components/NewsCard';
import SetupModal from './components/SetupModal';
import LoadingSpinner from './components/LoadingSpinner';
import MonitoringDashboard from './components/MonitoringDashboard';
import LiveFeed from './components/LiveFeed';
import axios from 'axios';

function App() {
  const [news, setNews] = useState([]);
  const [loading, setLoading] = useState(true);
  const [showSetup, setShowSetup] = useState(false);
  const [hasApiKey, setHasApiKey] = useState(false);
  const [stats, setStats] = useState(null);
  const [showMonitoring, setShowMonitoring] = useState(false);
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
      
      // Refresh news every 30 seconds for testing
      const interval = setInterval(() => {
        loadNews();
        loadStats();
        
        // Notify monitoring about frontend refresh
        if (newSocket) {
          newSocket.emit('frontend-refresh', { articlesCount: news.length });
        }
      }, 30000);

      return () => {
        clearInterval(interval);
        if (newSocket) {
          newSocket.disconnect();
        }
      };
    }
  }, [hasApiKey, news.length]);

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
      console.log(`📰 Loaded ${response.data.length} articles`);
      setNews(response.data);
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
    return <SetupModal onComplete={handleSetupComplete} />;
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-50 to-slate-100">
      <Header 
        stats={stats} 
        onRefresh={triggerNewsCollection}
        onSettings={() => setShowSetup(true)}
        onMonitoring={() => setShowMonitoring(true)}
      />
      
      <main className="flex-1 pt-16">
        <LiveFeed 
          initialNews={news} 
          hasApiKey={hasApiKey}
        />
      </main>
      
      {showMonitoring && (
        <div className="fixed inset-0 z-50 bg-black bg-opacity-50 flex items-center justify-center">
          <div className="w-full h-full">
            <MonitoringDashboard onClose={() => setShowMonitoring(false)} />
          </div>
        </div>
      )}
    </div>
  );
}

export default App;