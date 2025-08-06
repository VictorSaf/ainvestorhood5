import React, { useState, useEffect, useRef } from 'react';
import { io } from 'socket.io-client';
import { Activity, TrendingUp, AlertCircle, RefreshCw, Bot, Edit3 } from 'lucide-react';
import NewsCard from './NewsCard';
import EditableComponent from './EditableComponent';
import { Button, Card, Badge } from './ui';
import { useEditMode } from '../hooks/useEditMode';

const LiveFeed = ({ initialNews = [], hasApiKey, onRefresh, onMonitoring, onAIDashboard }) => {
  const [articles, setArticles] = useState(initialNews);
  const [socket, setSocket] = useState(null);
  const [isConnected, setIsConnected] = useState(false);
  const [isProcessing, setIsProcessing] = useState(false);
  const [newArticleIds, setNewArticleIds] = useState(new Set());
  const [processingStats, setProcessingStats] = useState({ processed: 0, duplicates: 0, errors: 0 });
  const feedRef = useRef(null);
  
  const { isGlobalEditMode, toggleGlobalEditMode } = useEditMode();

  useEffect(() => {
    if (!hasApiKey) return;

    // Connect to WebSocket - use same origin for Docker compatibility
    const newSocket = io();
    
    newSocket.on('connect', () => {
      console.log('🔗 Connected to live feed');
      setIsConnected(true);
    });

    newSocket.on('disconnect', () => {
      console.log('❌ Disconnected from live feed');
      setIsConnected(false);
    });

    // Handle initial articles - FORȚAT
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

      // Don't auto-scroll - let user stay where they are
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

  // Update articles when initialNews changes - WITH DEBUGGING
  useEffect(() => {
    console.log('🔄 LiveFeed useEffect triggered. initialNews:', initialNews);
    if (initialNews.length > 0) {
      console.log('🔄 Setting articles from initialNews:', initialNews.length, initialNews);
      setArticles(initialNews);
      console.log('🔄 LiveFeed articles state updated!');
    } else {
      console.log('❌ LiveFeed: No initial news to set');
    }
  }, [initialNews]);


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
            <div className="flex items-center gap-3">
              <div className="p-2 bg-gradient-to-br from-blue-500 to-purple-600 rounded-xl">
                <TrendingUp size={20} className="text-white" />
              </div>
              <EditableComponent
                componentName="AppTitle"
                onSave={(props) => console.log('Title saved:', props)}
                editableProps={['children', 'className']}
                allowAddElements={false}
                allowDeleteElements={false}
              >
                <h1 className="text-xl font-bold bg-gradient-to-r from-blue-600 to-purple-600 bg-clip-text text-transparent">
                  AIInvestorHood
                </h1>
              </EditableComponent>
            </div>
            
            <EditableComponent
              componentName="ConnectionStatus"
              onSave={(props) => console.log('Status saved:', props)}
              editableProps={['variant', 'className']}
              allowAddElements={false}
              allowDeleteElements={false}
            >
              <Badge 
                variant={isConnected ? 'success' : 'danger'}
                className="flex items-center gap-2"
              >
                <div className={`w-2 h-2 rounded-full ${
                  isConnected ? 'bg-emerald-500 animate-pulse' : 'bg-red-500'
                }`}></div>
                <span>{isConnected ? 'Live' : 'Offline'}</span>
              </Badge>
            </EditableComponent>
          </div>

          {isProcessing && (
            <EditableComponent
              componentName="ProcessingIndicator"
              onSave={(props) => console.log('Processing indicator saved:', props)}
              editableProps={['className', 'children']}
              allowAddElements={false}
              allowDeleteElements={false}
            >
              <div className="flex items-center gap-2 px-4 py-2 bg-gradient-to-r from-indigo-500 to-purple-600 text-white rounded-full text-sm font-medium">
                <div className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin"></div>
                <span>Analyzing news...</span>
              </div>
            </EditableComponent>
          )}

          <EditableComponent
            componentName="ProcessingStats"
            onSave={(props) => console.log('Processing stats saved:', props)}
            editableProps={['className']}
            allowAddElements={true}
            allowDeleteElements={false}
          >
            <div className="flex items-center gap-4">
              <EditableComponent
                componentName="NewArticlesCounter"
                onSave={(props) => console.log('New articles counter saved:', props)}
                editableProps={['className', 'children']}
                allowAddElements={false}
                allowDeleteElements={false}
              >
                <div className="flex items-center gap-1 text-sm text-gray-600 font-medium">
                  <TrendingUp size={14} className="text-blue-500" />
                  <span>{processingStats.processed} new</span>
                </div>
              </EditableComponent>
              
              <EditableComponent
                componentName="FilteredArticlesCounter"
                onSave={(props) => console.log('Filtered articles counter saved:', props)}
                editableProps={['className', 'children']}
                allowAddElements={false}
                allowDeleteElements={false}
              >
                <div className="text-sm text-gray-600 font-medium">
                  <span>{processingStats.duplicates} filtered</span>
                </div>
              </EditableComponent>
              
              {processingStats.errors > 0 && (
                <EditableComponent
                  componentName="ErrorCounter"
                  onSave={(props) => console.log('Error counter saved:', props)}
                  editableProps={['className', 'children']}
                  allowAddElements={false}
                  allowDeleteElements={false}
                >
                  <div className="text-sm text-red-600 font-medium">
                    <span>{processingStats.errors} errors</span>
                  </div>
                </EditableComponent>
              )}
            </div>
          </EditableComponent>

          <div className="flex items-center gap-1">
            <EditableComponent
              componentName="RefreshButton"
              onSave={(props) => console.log('Refresh button saved:', props)}
              editableProps={['variant', 'size']}
              allowAddElements={false}
              allowDeleteElements={false}
            >
              <Button 
                variant="ghost"
                size="sm"
                onClick={onRefresh} 
                title="Refresh News"
                className="p-2"
              >
                <RefreshCw size={20} />
              </Button>
            </EditableComponent>
            
            <EditableComponent
              componentName="MonitoringButton"
              onSave={(props) => console.log('Monitoring button saved:', props)}
              editableProps={['variant', 'size']}
              allowAddElements={false}
              allowDeleteElements={false}
            >
              <Button 
                variant="ghost"
                size="sm"
                onClick={onMonitoring} 
                title="System Monitor"
                className="p-2"
              >
                <Activity size={20} />
              </Button>
            </EditableComponent>
            
            <EditableComponent
              componentName="EditModeButton"
              onSave={(props) => console.log('Edit mode button saved:', props)}
              editableProps={['variant', 'size']}
              allowAddElements={false}
              allowDeleteElements={false}
            >
              <Button 
                variant={isGlobalEditMode ? "primary" : "ghost"}
                size="sm"
                onClick={() => {
                  console.log('🎨 LiveFeed edit button clicked - current mode:', isGlobalEditMode);
                  toggleGlobalEditMode();
                }} 
                title={isGlobalEditMode ? "Exit Edit Mode" : "Enter Edit Mode"}
                className={`p-2 ${isGlobalEditMode ? 'bg-red-600 text-white hover:bg-red-700' : 'hover:bg-gray-100'}`}
              >
                <Edit3 size={20} />
                {isGlobalEditMode ? " EXIT" : " EDIT"}
              </Button>
            </EditableComponent>

            {/* DEBUG: Test button to verify edit mode works */}
            <button 
              onClick={() => {
                console.log('🔧 DEBUG: Direct toggle button clicked');
                toggleGlobalEditMode();
              }}
              className="ml-2 px-3 py-1 bg-yellow-500 text-white rounded text-sm"
            >
              🔧 DEBUG TOGGLE
            </button>
          </div>
        </div>
      </div>

      <div className="p-5 max-w-4xl mx-auto">
        {articles.length === 0 ? (
          <EditableComponent
            componentName="EmptyState"
            onSave={(props) => console.log('Empty state saved:', props)}
            editableProps={['className', 'children']}
            allowAddElements={true}
            allowDeleteElements={false}
          >
            <div className="flex flex-col items-center justify-center py-20 text-center text-gray-500">
              <TrendingUp size={48} className="text-gray-400 mb-4" />
              <EditableComponent
                componentName="EmptyStateTitle"
                onSave={(props) => console.log('Empty state title saved:', props)}
                editableProps={['className', 'children']}
                allowAddElements={false}
                allowDeleteElements={false}
              >
                <h3 className="text-lg font-semibold text-gray-700 mb-2">No articles yet</h3>
              </EditableComponent>
              
              <EditableComponent
                componentName="EmptyStateDescription"
                onSave={(props) => console.log('Empty state description saved:', props)}
                editableProps={['className', 'children']}
                allowAddElements={false}
                allowDeleteElements={false}
              >
                <p className="text-sm leading-relaxed mb-5">Waiting for financial news to be analyzed...</p>
              </EditableComponent>
              
              {isProcessing && (
                <EditableComponent
                  componentName="EmptyStateLoader"
                  onSave={(props) => console.log('Empty state loader saved:', props)}
                  editableProps={['className', 'children']}
                  allowAddElements={false}
                  allowDeleteElements={false}
                >
                  <div className="flex items-center gap-3 px-6 py-3 bg-indigo-100 text-indigo-700 rounded-full text-sm font-medium">
                    <div className="w-5 h-5 border-2 border-indigo-300 border-t-indigo-600 rounded-full animate-spin"></div>
                    <span>Processing articles...</span>
                  </div>
                </EditableComponent>
              )}
            </div>
          </EditableComponent>
        ) : (
          <div className="space-y-0">
            {articles.map((article, index) => (
              <NewsCard
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
        <EditableComponent
          componentName="MonitoringFooter"
          onSave={(props) => console.log('Monitoring footer saved:', props)}
          editableProps={['className']}
          allowAddElements={true}
          allowDeleteElements={false}
        >
          <div className="sticky bottom-0 bg-white/95 backdrop-blur-xl border-t border-gray-200/50 p-3">
            <EditableComponent
              componentName="MonitoringStatus"
              onSave={(props) => console.log('Monitoring status saved:', props)}
              editableProps={['className', 'children']}
              allowAddElements={false}
              allowDeleteElements={false}
            >
              <div className="flex items-center justify-center gap-2 text-gray-600 text-sm font-medium">
                <div className="w-2 h-2 bg-emerald-500 rounded-full animate-pulse"></div>
                <span>Monitoring {articles.length} articles in real-time</span>
              </div>
            </EditableComponent>
          </div>
        </EditableComponent>
      )}
    </div>
  );
};

export default LiveFeed;