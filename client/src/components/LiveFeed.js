import React, { useState, useEffect, useRef } from 'react';
import { io } from 'socket.io-client';
import { Activity, Zap, TrendingUp, AlertCircle } from 'lucide-react';
import ModernNewsCard from './ModernNewsCard';

const LiveFeed = ({ initialNews = [], hasApiKey }) => {
  const [articles, setArticles] = useState(initialNews);
  const [socket, setSocket] = useState(null);
  const [isConnected, setIsConnected] = useState(false);
  const [isProcessing, setIsProcessing] = useState(false);
  const [newArticleIds, setNewArticleIds] = useState(new Set());
  const [stats, setStats] = useState({ processed: 0, duplicates: 0, errors: 0 });
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
      console.log(`📰 Received ${initialArticles.length} initial articles`);
      setArticles(initialArticles);
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
      setStats({
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
    if (initialNews.length > 0 && articles.length === 0) {
      setArticles(initialNews);
    }
  }, [initialNews, articles.length]);

  const handleRefresh = () => {
    if (socket) {
      socket.emit('request-refresh');
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

  return (
    <div className="h-screen overflow-y-auto bg-gradient-to-br from-slate-50 to-slate-100" ref={feedRef}>
      <div className="sticky top-0 bg-white/95 backdrop-blur-xl border-b border-gray-200/50 p-4 z-50">
        <div className="flex items-center justify-between gap-4 flex-wrap">
          <div className="flex items-center gap-3 flex-1">
            <Activity size={20} className="text-blue-600" />
            <h2 className="text-lg font-bold text-gray-900">Live Financial News</h2>
            <div className={`flex items-center gap-2 px-3 py-1 rounded-full text-xs font-semibold uppercase tracking-wide ${
              isConnected 
                ? 'bg-emerald-100 text-emerald-700' 
                : 'bg-red-100 text-red-700'
            }`}>
              <div className={`w-2 h-2 rounded-full ${
                isConnected ? 'bg-emerald-500 animate-pulse' : 'bg-red-500'
              }`}></div>
              <span>{isConnected ? 'Live' : 'Offline'}</span>
            </div>
          </div>

          {isProcessing && (
            <div className="flex items-center gap-2 px-4 py-2 bg-gradient-to-r from-indigo-500 to-purple-600 text-white rounded-full text-sm font-medium">
              <div className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin"></div>
              <span>Analyzing news...</span>
            </div>
          )}

          <div className="flex items-center gap-4">
            <div className="flex items-center gap-1 text-sm text-gray-600 font-medium">
              <TrendingUp size={14} className="text-blue-500" />
              <span>{stats.processed} new</span>
            </div>
            <div className="text-sm text-gray-600 font-medium">
              <span>{stats.duplicates} filtered</span>
            </div>
            {stats.errors > 0 && (
              <div className="text-sm text-red-600 font-medium">
                <span>{stats.errors} errors</span>
              </div>
            )}
          </div>

          <button 
            className="flex items-center gap-2 px-4 py-2 bg-gradient-to-r from-emerald-500 to-emerald-600 hover:from-emerald-600 hover:to-emerald-700 text-white rounded-full text-sm font-medium transition-all duration-300 hover:-translate-y-0.5 hover:shadow-lg hover:shadow-emerald-500/25"
            onClick={handleRefresh}
          >
            <Zap size={16} />
            <span>Refresh</span>
          </button>
        </div>
      </div>

      <div className="p-5 max-w-4xl mx-auto">
        {articles.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-20 text-center text-gray-500">
            <TrendingUp size={48} className="text-gray-400 mb-4" />
            <h3 className="text-lg font-semibold text-gray-700 mb-2">No articles yet</h3>
            <p className="text-sm leading-relaxed mb-5">Waiting for financial news to be analyzed...</p>
            {isProcessing && (
              <div className="flex items-center gap-3 px-6 py-3 bg-indigo-100 text-indigo-700 rounded-full text-sm font-medium">
                <div className="w-5 h-5 border-2 border-indigo-300 border-t-indigo-600 rounded-full animate-spin"></div>
                <span>Processing articles...</span>
              </div>
            )}
          </div>
        ) : (
          <div className="space-y-0">
            {articles.map((article, index) => (
              <ModernNewsCard
                key={`${article.id}-${article.created_at}`}
                article={article}
                index={index}
                isNew={newArticleIds.has(article.id)}
              />
            ))}
          </div>
        )}
      </div>

      {isConnected && articles.length > 0 && (
        <div className="sticky bottom-0 bg-white/95 backdrop-blur-xl border-t border-gray-200/50 p-3">
          <div className="flex items-center justify-center gap-2 text-gray-600 text-sm font-medium">
            <div className="w-2 h-2 bg-emerald-500 rounded-full animate-pulse"></div>
            <span>Monitoring {articles.length} articles in real-time</span>
          </div>
        </div>
      )}
    </div>
  );
};

export default LiveFeed;