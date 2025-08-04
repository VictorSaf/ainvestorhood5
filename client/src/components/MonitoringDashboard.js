import React, { useState, useEffect, useRef } from 'react';
import io from 'socket.io-client';
import AIConfigurationTab from './AIConfigurationTab';
import ThemeEditor from './ThemeEditor';
import {
  Chart as ChartJS,
  CategoryScale,
  LinearScale,
  PointElement,
  LineElement,
  Title,
  Tooltip,
  Legend,
  TimeScale
} from 'chart.js';
import { Line } from 'react-chartjs-2';
import 'chartjs-adapter-date-fns';

ChartJS.register(
  CategoryScale,
  LinearScale,
  PointElement,
  LineElement,
  Title,
  Tooltip,
  Legend,
  TimeScale
);

const MonitoringDashboard = ({ onClose }) => {
  // Add custom scrollbar styles
  useEffect(() => {
    const style = document.createElement('style');
    style.textContent = `
      .scrollbar-thin {
        scrollbar-width: thin;
      }
      .scrollbar-thin::-webkit-scrollbar {
        width: 6px;
        height: 6px;
      }
      .scrollbar-thin::-webkit-scrollbar-track {
        background: #f1f1f1;
        border-radius: 3px;
      }
      .scrollbar-thin::-webkit-scrollbar-thumb {
        background: #c1c1c1;
        border-radius: 3px;
      }
      .scrollbar-thin::-webkit-scrollbar-thumb:hover {
        background: #a8a8a8;
      }
      .scrollbar-thumb-gray-300::-webkit-scrollbar-thumb {
        background: #d1d5db;
      }
      .scrollbar-thumb-blue-300::-webkit-scrollbar-thumb {
        background: #93c5fd;
      }
      .scrollbar-thumb-red-300::-webkit-scrollbar-thumb {
        background: #fca5a5;
      }
      .scrollbar-thumb-purple-300::-webkit-scrollbar-thumb {
        background: #d8b4fe;
      }
      .hover\\:scrollbar-thumb-gray-400:hover::-webkit-scrollbar-thumb {
        background: #9ca3af;
      }
      .hover\\:scrollbar-thumb-blue-400:hover::-webkit-scrollbar-thumb {
        background: #60a5fa;
      }
      .hover\\:scrollbar-thumb-red-400:hover::-webkit-scrollbar-thumb {
        background: #f87171;
      }
      .hover\\:scrollbar-thumb-purple-400:hover::-webkit-scrollbar-thumb {
        background: #c084fc;
      }
    `;
    document.head.appendChild(style);
    
    return () => {
      document.head.removeChild(style);
    };
  }, []);

  const [metrics, setMetrics] = useState(null);
  const [logs, setLogs] = useState([]);
  const [isConnected, setIsConnected] = useState(false);
  const [activeTab, setActiveTab] = useState('overview');
  const [lastUpdate, setLastUpdate] = useState(new Date());
  const [streamingActive, setStreamingActive] = useState(false);
  const [chartData, setChartData] = useState({
    cpu: [],
    memoryUsage: [],
    totalMemory: []
  });
  const [scrapySources, setScrapySources] = useState([]);
  const [sourceStats, setSourceStats] = useState(null);
  const [sourcesLoading, setSourcesLoading] = useState(false);
  const [showFullSourcesList, setShowFullSourcesList] = useState(false);
  const socketRef = useRef(null);
  const maxDataPoints = 288; // 2 hours at 250ms intervals = 28800, but keep 288 for display

  useEffect(() => {
    // Connect to monitoring WebSocket (use relative URL for Docker compatibility)
    socketRef.current = io();
    
    socketRef.current.on('connect', () => {
      console.log('Connected to monitoring');
      setIsConnected(true);
    });

    socketRef.current.on('disconnect', () => {
      setIsConnected(false);
    });

    // Listen for real-time metrics updates
    socketRef.current.on('systemMetrics', (data) => {
      setMetrics(prev => prev ? { ...prev, system: data } : null);
      setLastUpdate(new Date());
      setStreamingActive(true);
      setTimeout(() => setStreamingActive(false), 500);

      // Update chart data
      const now = new Date();
      setChartData(prev => {
        const newCpuData = [...prev.cpu, { x: now, y: data.cpu?.usage || 0 }];
        const newMemoryUsageData = [...prev.memoryUsage, { 
          x: now, 
          y: data.memory?.percentage || 0 
        }];
        const newTotalMemoryData = [...prev.totalMemory, { 
          x: now, 
          y: data.memory?.total ? (data.memory.total / (1024 * 1024 * 1024)) : 0 // Convert to GB
        }];

        // Keep only last maxDataPoints
        return {
          cpu: newCpuData.slice(-maxDataPoints),
          memoryUsage: newMemoryUsageData.slice(-maxDataPoints),
          totalMemory: newTotalMemoryData.slice(-maxDataPoints)
        };
      });
    });

    socketRef.current.on('httpMetrics', (data) => {
      setMetrics(prev => prev ? { ...prev, http: data } : null);
      setLastUpdate(new Date());
      setStreamingActive(true);
      setTimeout(() => setStreamingActive(false), 500);
    });

    socketRef.current.on('websocketMetrics', (data) => {
      setMetrics(prev => prev ? { ...prev, websocket: data } : null);
      setLastUpdate(new Date());
      setStreamingActive(true);
      setTimeout(() => setStreamingActive(false), 500);
    });

    socketRef.current.on('databaseMetrics', (data) => {
      setMetrics(prev => prev ? { ...prev, database: data } : null);
      setLastUpdate(new Date());
      setStreamingActive(true);
      setTimeout(() => setStreamingActive(false), 500);
    });

    socketRef.current.on('aiMetrics', (data) => {
      setMetrics(prev => prev ? { ...prev, ai: data } : null);
      setLastUpdate(new Date());
      setStreamingActive(true);
      setTimeout(() => setStreamingActive(false), 500);
    });

    socketRef.current.on('scrapyMetrics', (data) => {
      setMetrics(prev => prev ? { ...prev, scrapy: data } : null);
      setLastUpdate(new Date());
      setStreamingActive(true);
      setTimeout(() => setStreamingActive(false), 500);
    });

    // Listen for log updates
    socketRef.current.on('log', (logEntry) => {
      setLogs(prev => [logEntry, ...prev.slice(0, 99)]);
      setLastUpdate(new Date());
      setStreamingActive(true);
      setTimeout(() => setStreamingActive(false), 500);
    });


    // Fetch initial metrics
    fetchMetrics();

    // Refresh metrics every 5 seconds as fallback
    const refreshInterval = setInterval(() => {
      if (isConnected) {
        fetchMetrics();
      }
    }, 5000);

    return () => {
      if (socketRef.current) {
        socketRef.current.disconnect();
      }
      clearInterval(refreshInterval);
    };
  }, []);

  // Fetch RSS sources when tab is active
  useEffect(() => {
    if (activeTab === 'rss') {
      fetchScrapySources();
    }
  }, [activeTab]);

  const fetchMetrics = async () => {
    try {
      const response = await fetch('/api/monitor/metrics');
      const data = await response.json();
      setMetrics(data);
      setLogs(data.recentLogs || []);
    } catch (error) {
      console.error('Failed to fetch metrics:', error);
    }
  };

  const formatBytes = (bytes) => {
    if (bytes === 0) return '0 B';
    const k = 1024;
    const sizes = ['B', 'KB', 'MB', 'GB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
  };

  const formatUptime = (ms) => {
    const seconds = Math.floor(ms / 1000);
    const minutes = Math.floor(seconds / 60);
    const hours = Math.floor(minutes / 60);
    const days = Math.floor(hours / 24);
    
    if (days > 0) return `${days}d ${hours % 24}h`;
    if (hours > 0) return `${hours}h ${minutes % 60}m`;
    if (minutes > 0) return `${minutes}m ${seconds % 60}s`;
    return `${seconds}s`;
  };

  const getStatusColor = (status) => {
    switch (status) {
      case 'running': return 'text-green-500';
      case 'idle': return 'text-blue-500';
      case 'error': return 'text-red-500';
      default: return 'text-gray-500';
    }
  };

  const getLogLevelColor = (level) => {
    switch (level) {
      case 'ERROR': return 'text-red-500 bg-red-50';
      case 'WARN': return 'text-yellow-600 bg-yellow-50';
      case 'INFO': return 'text-blue-500 bg-blue-50';
      case 'DEBUG': return 'text-gray-500 bg-gray-50';
      default: return 'text-gray-500 bg-gray-50';
    }
  };

  // Fetch Scrapy sources from database
  const fetchScrapySources = async () => {
    if (sourcesLoading) return;
    
    setSourcesLoading(true);
    try {
      const response = await fetch('/api/rss-sources?limit=100');
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

  // Fetch all Scrapy sources for the modal
  const fetchAllScrapySources = async () => {
    console.log('fetchAllScrapySources called');
    setSourcesLoading(true);
    try {
      const response = await fetch('/api/rss-sources?limit=1000');
      const data = await response.json();
      console.log('Fetched sources data:', data);
      
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

  if (!metrics) {
    return (
      <div className="min-h-screen bg-gray-100 flex items-center justify-center">
        <div className="text-center">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-500 mx-auto"></div>
          <p className="mt-4 text-gray-600">Loading monitoring dashboard...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="h-full bg-gray-100 flex flex-col">
      {/* Header */}
      <div className="bg-white shadow-sm border-b">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex justify-between items-center py-4">
            <div className="flex items-center">
              <h1 className="text-2xl font-bold text-gray-900">System Monitor</h1>
              <div className={`ml-4 flex items-center ${isConnected ? 'text-green-500' : 'text-red-500'}`}>
                <div className={`w-2 h-2 rounded-full ${isConnected ? 'bg-green-500' : 'bg-red-500'} mr-2 ${streamingActive ? 'animate-pulse' : ''}`}></div>
                <span className="text-sm font-medium">
                  {isConnected ? 'Live Stream' : 'Disconnected'}
                </span>
                {streamingActive && (
                  <span className="ml-2 text-xs bg-green-100 text-green-800 px-2 py-1 rounded-full animate-pulse">
                    Updating...
                  </span>
                )}
              </div>
            </div>
            <div className="flex items-center space-x-4">
              <div className="text-sm text-gray-500">
                Last updated: {lastUpdate.toLocaleTimeString()}
              </div>
              <div className="flex items-center space-x-2">
                <div className={`w-1 h-1 rounded-full ${isConnected ? 'bg-green-400 animate-pulse' : 'bg-gray-400'}`}></div>
                <span className="text-xs text-gray-400">
                  {isConnected ? 'Real-time' : 'Offline'}
                </span>
              </div>
              {onClose && (
                <button
                  onClick={onClose}
                  className="text-gray-400 hover:text-gray-600 transition-colors"
                >
                  ✕
                </button>
              )}
            </div>
          </div>
        </div>
      </div>

      {/* Navigation Tabs */}
      <div className="bg-white border-b flex-shrink-0">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex space-x-8">
            {['overview', 'system', 'http', 'websocket', 'database', 'ai', 'rss', 'api', 'logs', 'theme'].map((tab) => (
              <button
                key={tab}
                onClick={() => setActiveTab(tab)}
                className={`py-2 px-1 border-b-2 font-medium text-sm capitalize ${
                  activeTab === tab
                    ? 'border-blue-500 text-blue-600'
                    : 'border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300'
                }`}
              >
                {tab === 'api' ? 'API' : 
                 tab === 'ai' ? 'AI' : 
                 tab === 'rss' ? 'RSS Collection' :
                 tab}
              </button>
            ))}
          </div>
        </div>
      </div>

      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-6 flex-1 overflow-y-auto">
        {/* Overview Tab */}
        {activeTab === 'overview' && (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-5 gap-6">
            {/* System Overview */}
            <div className="bg-white rounded-lg shadow p-6">
              <h3 className="text-lg font-semibold text-gray-900 mb-4">System</h3>
              <div className="space-y-3">
                <div className="flex justify-between">
                  <span className="text-gray-600">CPU Usage</span>
                  <span className="font-medium">{metrics.system?.cpu?.usage || 0}%</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-gray-600">Memory</span>
                  <span className="font-medium">{metrics.system?.memory?.percentage || 0}%</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-gray-600">Uptime</span>
                  <span className="font-medium">{formatUptime((metrics.system?.uptime || 0) * 1000)}</span>
                </div>
              </div>
            </div>

            {/* HTTP Overview */}
            <div className="bg-white rounded-lg shadow p-6">
              <h3 className="text-lg font-semibold text-gray-900 mb-4">HTTP</h3>
              <div className="space-y-3">
                <div className="flex justify-between">
                  <span className="text-gray-600">Total Requests</span>
                  <span className="font-medium">{metrics.http?.requests?.total || 0}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-gray-600">Active</span>
                  <span className="font-medium">{metrics.http?.requests?.active || 0}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-gray-600">Errors</span>
                  <span className="font-medium text-red-500">{metrics.http?.requests?.errors || 0}</span>
                </div>
              </div>
            </div>

            {/* Database Overview */}
            <div className="bg-white rounded-lg shadow p-6">
              <h3 className="text-lg font-semibold text-gray-900 mb-4">Database</h3>
              <div className="space-y-3">
                <div className="flex justify-between">
                  <span className="text-gray-600">Total Queries</span>
                  <span className="font-medium">{metrics.database?.queries?.total || 0}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-gray-600">Active</span>
                  <span className="font-medium">{metrics.database?.queries?.active || 0}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-gray-600">Avg Time</span>
                  <span className="font-medium">{Math.round(metrics.database?.queries?.avgTime || 0)}ms</span>
                </div>
              </div>
            </div>

            {/* AI Overview */}
            <div className="bg-white rounded-lg shadow p-6">
              <h3 className="text-lg font-semibold text-gray-900 mb-4">AI Service</h3>
              <div className="space-y-3">
                <div className="flex justify-between">
                  <span className="text-gray-600">Requests</span>
                  <span className="font-medium">{metrics.ai?.requests?.total || 0}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-gray-600">Tokens Used</span>
                  <span className="font-medium">{metrics.ai?.tokens?.used?.toLocaleString() || 0}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-gray-600">Cost</span>
                  <span className="font-medium">${(metrics.ai?.tokens?.cost || 0).toFixed(4)}</span>
                </div>
              </div>
            </div>

            {/* RSS Collection Overview */}
            <div className="bg-white rounded-lg shadow p-6">
              <h3 className="text-lg font-semibold text-gray-900 mb-4">RSS Collection</h3>
              <div className="space-y-3">
                <div className="flex justify-between">
                  <span className="text-gray-600">Status</span>
                  <span className={`font-medium ${getStatusColor(metrics.scrapy?.status || 'idle')}`}>
                    {(metrics.scrapy?.status || 'idle').toUpperCase()}
                  </span>
                </div>
                <div className="flex justify-between">
                  <span className="text-gray-600">Articles Processed</span>
                  <span className="font-medium">{metrics.scrapy?.articlesProcessed || 0}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-gray-600">Last Run</span>
                  <span className="font-medium text-xs">
                    {metrics.scrapy?.lastRun ? new Date(metrics.scrapy.lastRun).toLocaleTimeString() : 'Never'}
                  </span>
                </div>
              </div>
            </div>
          </div>
        )}

        {/* System Tab */}
        {activeTab === 'system' && (
          <div className="space-y-6">
            {/* Current Stats */}
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
              <div className="bg-white rounded-lg shadow p-6">
                <h3 className="text-lg font-semibold text-gray-900 mb-4">CPU & Memory</h3>
                <div className="space-y-4">
                  <div>
                    <div className="flex justify-between mb-2">
                      <span className="text-gray-600">CPU Usage</span>
                      <span className="font-medium">{metrics.system?.cpu?.usage || 0}%</span>
                    </div>
                    <div className="w-full bg-gray-200 rounded-full h-2">
                      <div 
                        className="bg-blue-500 h-2 rounded-full" 
                        style={{ width: `${metrics.system?.cpu?.usage || 0}%` }}
                      ></div>
                    </div>
                  </div>
                  <div>
                    <div className="flex justify-between mb-2">
                      <span className="text-gray-600">Memory Usage</span>
                      <span className="font-medium">{metrics.system?.memory?.percentage || 0}%</span>
                    </div>
                    <div className="w-full bg-gray-200 rounded-full h-2">
                      <div 
                        className="bg-green-500 h-2 rounded-full" 
                        style={{ width: `${metrics.system?.memory?.percentage || 0}%` }}
                      ></div>
                    </div>
                  </div>
                  <div className="grid grid-cols-2 gap-4 mt-4">
                    <div>
                      <span className="text-gray-600 text-sm">CPU Cores</span>
                      <p className="font-medium">{metrics.system?.cpu?.cores || 0}</p>
                    </div>
                    <div>
                      <span className="text-gray-600 text-sm">Total Memory</span>
                      <p className="font-medium">{formatBytes(metrics.system?.memory?.total || 0)}</p>
                    </div>
                  </div>
                </div>
              </div>

              <div className="bg-white rounded-lg shadow p-6">
                <h3 className="text-lg font-semibold text-gray-900 mb-4">System Info</h3>
                <div className="space-y-3">
                  <div className="flex justify-between">
                    <span className="text-gray-600">System Uptime</span>
                    <span className="font-medium">{formatUptime((metrics.system?.uptime || 0) * 1000)}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-gray-600">App Uptime</span>
                    <span className="font-medium">{formatUptime(metrics.app?.uptime || 0)}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-gray-600">Load Average</span>
                    <span className="font-medium">
                      {metrics.system?.loadAverage?.map(load => load.toFixed(2)).join(', ') || '0.00'}
                    </span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-gray-600">Environment</span>
                    <span className="font-medium">{metrics.app?.environment || 'development'}</span>
                  </div>
                </div>
              </div>
            </div>

            {/* Charts */}
            <div className="grid grid-cols-1 xl:grid-cols-3 gap-6">
              {/* CPU Usage Chart */}
              <div className="bg-white rounded-lg shadow p-6">
                <h3 className="text-lg font-semibold text-gray-900 mb-4">CPU Usage - Last 2 Hours</h3>
                <div className="h-64">
                  <Line
                    data={{
                      datasets: [
                        {
                          label: 'CPU Usage (%)',
                          data: chartData.cpu,
                          borderColor: 'rgb(59, 130, 246)',
                          backgroundColor: 'rgba(59, 130, 246, 0.1)',
                          tension: 0.1,
                          pointRadius: 0,
                          borderWidth: 2,
                        },
                      ],
                    }}
                    options={{
                      responsive: true,
                      maintainAspectRatio: false,
                      plugins: {
                        legend: {
                          display: false,
                        },
                        title: {
                          display: false,
                        },
                      },
                      scales: {
                        x: {
                          type: 'time',
                          time: {
                            unit: 'minute',
                            displayFormats: {
                              minute: 'HH:mm'
                            }
                          },
                          ticks: {
                            maxTicksLimit: 6,
                          },
                        },
                        y: {
                          beginAtZero: true,
                          max: 100,
                          ticks: {
                            callback: function(value) {
                              return value + '%';
                            },
                          },
                        },
                      },
                      elements: {
                        line: {
                          tension: 0.4,
                        },
                      },
                    }}
                  />
                </div>
              </div>

              {/* Memory Usage Chart */}
              <div className="bg-white rounded-lg shadow p-6">
                <h3 className="text-lg font-semibold text-gray-900 mb-4">Memory Usage - Last 2 Hours</h3>
                <div className="h-64">
                  <Line
                    data={{
                      datasets: [
                        {
                          label: 'Memory Usage (%)',
                          data: chartData.memoryUsage,
                          borderColor: 'rgb(34, 197, 94)',
                          backgroundColor: 'rgba(34, 197, 94, 0.1)',
                          tension: 0.1,
                          pointRadius: 0,
                          borderWidth: 2,
                        },
                      ],
                    }}
                    options={{
                      responsive: true,
                      maintainAspectRatio: false,
                      plugins: {
                        legend: {
                          display: false,
                        },
                        title: {
                          display: false,
                        },
                      },
                      scales: {
                        x: {
                          type: 'time',
                          time: {
                            unit: 'minute',
                            displayFormats: {
                              minute: 'HH:mm'
                            }
                          },
                          ticks: {
                            maxTicksLimit: 6,
                          },
                        },
                        y: {
                          beginAtZero: true,
                          max: 100,
                          ticks: {
                            callback: function(value) {
                              return value + '%';
                            },
                          },
                        },
                      },
                      elements: {
                        line: {
                          tension: 0.4,
                        },
                      },
                    }}
                  />
                </div>
              </div>

              {/* Total Memory Chart */}
              <div className="bg-white rounded-lg shadow p-6">
                <h3 className="text-lg font-semibold text-gray-900 mb-4">Total Memory - Last 2 Hours</h3>
                <div className="h-64">
                  <Line
                    data={{
                      datasets: [
                        {
                          label: 'Total Memory (GB)',
                          data: chartData.totalMemory,
                          borderColor: 'rgb(168, 85, 247)',
                          backgroundColor: 'rgba(168, 85, 247, 0.1)',
                          tension: 0.1,
                          pointRadius: 0,
                          borderWidth: 2,
                        },
                      ],
                    }}
                    options={{
                      responsive: true,
                      maintainAspectRatio: false,
                      plugins: {
                        legend: {
                          display: false,
                        },
                        title: {
                          display: false,
                        },
                      },
                      scales: {
                        x: {
                          type: 'time',
                          time: {
                            unit: 'minute',
                            displayFormats: {
                              minute: 'HH:mm'
                            }
                          },
                          ticks: {
                            maxTicksLimit: 6,
                          },
                        },
                        y: {
                          beginAtZero: true,
                          ticks: {
                            callback: function(value) {
                              return value.toFixed(1) + ' GB';
                            },
                          },
                        },
                      },
                      elements: {
                        line: {
                          tension: 0.4,
                        },
                      },
                    }}
                  />
                </div>
              </div>
            </div>
          </div>
        )}

        {/* HTTP Tab */}
        {activeTab === 'http' && (
          <div className="space-y-6">
            <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
              <div className="bg-white rounded-lg shadow p-6">
                <h3 className="text-lg font-semibold text-gray-900 mb-4">Request Stats</h3>
                <div className="space-y-3">
                  <div className="flex justify-between">
                    <span className="text-gray-600">Total</span>
                    <span className="font-medium">{metrics.http?.requests?.total || 0}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-gray-600">Active</span>
                    <span className="font-medium text-blue-500">{metrics.http?.requests?.active || 0}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-gray-600">Errors</span>
                    <span className="font-medium text-red-500">{metrics.http?.requests?.errors || 0}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-gray-600">Avg Response Time</span>
                    <span className="font-medium">{Math.round(metrics.http?.requests?.avgResponseTime || 0)}ms</span>
                  </div>
                </div>
              </div>

              <div className="bg-white rounded-lg shadow p-6">
                <h3 className="text-lg font-semibold text-gray-900 mb-4">Response Stats</h3>
                <div className="space-y-3">
                  <div className="flex justify-between">
                    <span className="text-gray-600">Success</span>
                    <span className="font-medium text-green-500">{metrics.http?.responses?.success || 0}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-gray-600">Error</span>
                    <span className="font-medium text-red-500">{metrics.http?.responses?.error || 0}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-gray-600">Pending</span>
                    <span className="font-medium text-yellow-500">{metrics.http?.responses?.pending || 0}</span>
                  </div>
                </div>
              </div>

              <div className="bg-white rounded-lg shadow p-6">
                <h3 className="text-lg font-semibold text-gray-900 mb-4">Active Requests</h3>
                <div className="space-y-2 max-h-40 overflow-y-auto">
                  {metrics.activeRequests?.length > 0 ? (
                    metrics.activeRequests.map((req, index) => (
                      <div key={index} className="text-sm">
                        <span className="font-medium">{req.method}</span>
                        <span className="text-gray-600 ml-2">{req.url}</span>
                      </div>
                    ))
                  ) : (
                    <p className="text-gray-500 text-sm">No active requests</p>
                  )}
                </div>
              </div>
            </div>

            {/* Route Statistics */}
            {metrics.http?.routes && metrics.http.routes.size > 0 && (
              <div className="bg-white rounded-lg shadow p-6">
                <h3 className="text-lg font-semibold text-gray-900 mb-4">Route Statistics</h3>
                <div className="max-h-80 overflow-y-auto overflow-x-auto scrollbar-thin scrollbar-thumb-gray-300 scrollbar-track-gray-100">
                  <table className="min-w-full">
                    <thead className="bg-gray-50 sticky top-0">
                      <tr className="border-b">
                        <th className="text-left py-3 px-3 font-medium text-gray-600">Route</th>
                        <th className="text-left py-3 px-3 font-medium text-gray-600">Requests</th>
                        <th className="text-left py-3 px-3 font-medium text-gray-600">Errors</th>
                        <th className="text-left py-3 px-3 font-medium text-gray-600">Avg Time</th>
                      </tr>
                    </thead>
                    <tbody>
                      {Array.from(metrics.http.routes.entries()).map(([route, stats]) => (
                        <tr key={route} className="border-b hover:bg-gray-50 transition-colors duration-150">
                          <td className="py-3 px-3 font-mono text-sm text-gray-900">{route}</td>
                          <td className="py-3 px-3 text-gray-900">{stats.requests}</td>
                          <td className="py-3 px-3 text-red-500 font-medium">{stats.errors}</td>
                          <td className="py-3 px-3 text-gray-900">{Math.round(stats.avgTime)}ms</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            )}
          </div>
        )}

        {/* WebSocket Tab */}
        {activeTab === 'websocket' && (
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            <div className="bg-white rounded-lg shadow p-6">
              <h3 className="text-lg font-semibold text-gray-900 mb-4">Connection Stats</h3>
              <div className="space-y-3">
                <div className="flex justify-between">
                  <span className="text-gray-600">Total Connections</span>
                  <span className="font-medium">{metrics.websocket?.connections?.total || 0}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-gray-600">Active Connections</span>
                  <span className="font-medium text-green-500">{metrics.websocket?.connections?.active || 0}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-gray-600">Messages Sent</span>
                  <span className="font-medium">{metrics.websocket?.messages?.sent || 0}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-gray-600">Messages Received</span>
                  <span className="font-medium">{metrics.websocket?.messages?.received || 0}</span>
                </div>
              </div>
            </div>

            <div className="bg-white rounded-lg shadow p-6">
              <h3 className="text-lg font-semibold text-gray-900 mb-4">Active Clients</h3>
              <div className="space-y-2 max-h-64 overflow-y-auto">
                {metrics.websocket?.clients && metrics.websocket.clients.size > 0 ? (
                  Array.from(metrics.websocket.clients.entries()).map(([clientId, client]) => (
                    <div key={clientId} className="border-b pb-2 mb-2 last:border-b-0">
                      <div className="text-sm font-medium">Client: {clientId.substr(0, 8)}...</div>
                      <div className="text-xs text-gray-500">
                        IP: {client.ip} | Connected: {formatUptime(Date.now() - client.connectedAt)}
                      </div>
                      <div className="text-xs text-gray-500">
                        Sent: {client.messagesSent} | Received: {client.messagesReceived}
                      </div>
                    </div>
                  ))
                ) : (
                  <p className="text-gray-500 text-sm">No active WebSocket clients</p>
                )}
              </div>
            </div>
          </div>
        )}

        {/* Database Tab */}
        {activeTab === 'database' && (
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            <div className="bg-white rounded-lg shadow p-6">
              <h3 className="text-lg font-semibold text-gray-900 mb-4">Query Stats</h3>
              <div className="space-y-3">
                <div className="flex justify-between">
                  <span className="text-gray-600">Total Queries</span>
                  <span className="font-medium">{metrics.database?.queries?.total || 0}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-gray-600">Active Queries</span>
                  <span className="font-medium text-blue-500">{metrics.database?.queries?.active || 0}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-gray-600">Query Errors</span>
                  <span className="font-medium text-red-500">{metrics.database?.queries?.errors || 0}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-gray-600">Avg Query Time</span>
                  <span className="font-medium">{Math.round(metrics.database?.queries?.avgTime || 0)}ms</span>
                </div>
              </div>
            </div>

            <div className="bg-white rounded-lg shadow p-6">
              <h3 className="text-lg font-semibold text-gray-900 mb-4">Operation Types</h3>
              <div className="space-y-3">
                <div className="flex justify-between">
                  <span className="text-gray-600">Read Operations</span>
                  <span className="font-medium text-blue-500">{metrics.database?.operations?.read || 0}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-gray-600">Write Operations</span>
                  <span className="font-medium text-green-500">{metrics.database?.operations?.write || 0}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-gray-600">Delete Operations</span>
                  <span className="font-medium text-red-500">{metrics.database?.operations?.delete || 0}</span>
                </div>
              </div>
            </div>

            {/* Active Queries */}
            {metrics.activeQueries?.length > 0 && (
              <div className="lg:col-span-2 bg-white rounded-lg shadow p-6">
                <h3 className="text-lg font-semibold text-gray-900 mb-4">Active Queries</h3>
                <div className="space-y-2 max-h-40 overflow-y-auto">
                  {metrics.activeQueries.map((query, index) => (
                    <div key={index} className="border-b pb-2 mb-2 last:border-b-0">
                      <div className="text-sm font-mono">{query.query}</div>
                      <div className="text-xs text-gray-500">
                        Type: {query.type} | Duration: {Date.now() - query.startTime}ms
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>
        )}

        {/* AI Tab */}
        {activeTab === 'ai' && (
          <AIConfigurationTab metrics={metrics} />
        )}


        {/* RSS Collection Tab */}
        {activeTab === 'rss' && (
          <div className="space-y-6">
            {sourcesLoading && (
              <div className="bg-blue-50 border border-blue-200 rounded-lg p-4">
                <div className="flex items-center">
                  <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-blue-600 mr-3"></div>
                  <span className="text-blue-700">Loading RSS sources from database...</span>
                </div>
              </div>
            )}

            {/* Database Statistics Overview */}
            <div className="grid grid-cols-1 lg:grid-cols-4 gap-6">
              <div 
                className="bg-white rounded-lg shadow p-6 cursor-pointer hover:shadow-lg transition-shadow duration-200"
                onClick={() => {
                  console.log('Total Sources card clicked!');
                  alert('Total Sources clicked! This should show the modal.');
                  setShowFullSourcesList(true);
                  fetchAllScrapySources();
                }}
              >
                <h3 className="text-lg font-semibold text-gray-900 mb-4">Total Sources</h3>
                <div className="text-3xl font-bold text-blue-600">
                  {sourceStats?.total_unique_sources || 0}
                </div>
                <p className="text-sm text-gray-600 mt-2">Unique domains scraped</p>
                <p className="text-xs text-blue-500 mt-1">Click to view all sources</p>
              </div>

              <div className="bg-white rounded-lg shadow p-6">
                <h3 className="text-lg font-semibold text-gray-900 mb-4">Total Articles</h3>
                <div className="text-3xl font-bold text-green-600">
                  {sourceStats?.total_articles || 0}
                </div>
                <p className="text-sm text-gray-600 mt-2">Articles collected</p>
              </div>

              <div className="bg-white rounded-lg shadow p-6">
                <h3 className="text-lg font-semibold text-gray-900 mb-4">Active Sources</h3>
                <div className="text-3xl font-bold text-purple-600">
                  {sourceStats?.active_sources || 0}
                </div>
                <p className="text-sm text-gray-600 mt-2">Sources with articles</p>
              </div>

              <div className="bg-white rounded-lg shadow p-6">
                <h3 className="text-lg font-semibold text-gray-900 mb-4">Date Range</h3>
                <div className="space-y-1">
                  <div className="text-sm text-gray-600">
                    <span className="font-medium">First:</span> {
                      sourceStats?.date_range?.first 
                        ? new Date(sourceStats.date_range.first).toLocaleDateString()
                        : 'N/A'
                    }
                  </div>
                  <div className="text-sm text-gray-600">
                    <span className="font-medium">Last:</span> {
                      sourceStats?.date_range?.last 
                        ? new Date(sourceStats.date_range.last).toLocaleDateString()
                        : 'N/A'
                    }
                  </div>
                </div>
              </div>
            </div>

            {/* Source Details from Database */}
            <div className="bg-white rounded-lg shadow">
              <div className="p-6 border-b">
                <h3 className="text-lg font-semibold text-gray-900">RSS Sources from Database</h3>
                <p className="text-sm text-gray-600 mt-1">All RSS sources used for news collection with article counts from the database</p>
              </div>
              <div className="max-h-96 overflow-y-auto overflow-x-auto scrollbar-thin scrollbar-thumb-blue-300 scrollbar-track-blue-100 hover:scrollbar-thumb-blue-400">
                {scrapySources && scrapySources.length > 0 ? (
                  <table className="min-w-full">
                    <thead className="bg-gray-50 sticky top-0">
                      <tr>
                        <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                          Domain
                        </th>
                        <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                          RSS Feed URL
                        </th>
                        <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                          Articles Count
                        </th>
                        <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                          First Scraped
                        </th>
                        <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                          Last Scraped
                        </th>
                        <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                          Status
                        </th>
                      </tr>
                    </thead>
                    <tbody className="bg-white divide-y divide-gray-200">
                      {scrapySources.map((source, index) => (
                        <tr key={index} className="hover:bg-gray-50">
                          <td className="px-6 py-4 whitespace-nowrap">
                            <div className="flex items-center">
                              <div className="text-sm font-medium text-gray-900">
                                {source.name || source.domain}
                              </div>
                            </div>
                          </td>
                          <td className="px-6 py-4">
                            <div className="text-sm text-gray-500 max-w-xs truncate" title={source.feed_url}>
                              {source.feed_url}
                            </div>
                          </td>
                          <td className="px-6 py-4 whitespace-nowrap">
                            <div className="text-sm font-medium text-blue-600">
                              {source.articles_count}
                            </div>
                          </td>
                          <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                            {source.first_scraped 
                              ? new Date(source.first_scraped).toLocaleDateString()
                              : 'Never'
                            }
                          </td>
                          <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                            {source.last_scraped 
                              ? new Date(source.last_scraped).toLocaleDateString()
                              : 'Never'
                            }
                          </td>
                          <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900">
                            <span className={`px-2 py-1 rounded-full text-xs font-medium ${
                              source.articles_count > 0 
                                ? 'bg-green-100 text-green-800' 
                                : 'bg-gray-100 text-gray-800'
                            }`}>
                              {source.articles_count > 0 ? 'Active' : 'Inactive'}
                            </span>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                ) : !sourcesLoading ? (
                  <div className="p-8 text-center text-gray-500">
                    <p>No RSS sources found in database</p>
                    <p className="text-sm mt-1">Sources will appear here after articles are collected and saved to the database</p>
                  </div>
                ) : null}
              </div>
            </div>

          </div>
        )}

        {/* Logs Tab */}
        {activeTab === 'logs' && (
          <div className="bg-white rounded-lg shadow">
            <div className="p-6 border-b flex justify-between items-center">
              <div>
                <h3 className="text-lg font-semibold text-gray-900">System Logs</h3>
                <p className="text-sm text-gray-600 mt-1">Real-time application logs</p>
              </div>
              <div className="text-sm text-gray-500 bg-gray-100 px-3 py-1 rounded-full">
                {logs.length} entries
              </div>
            </div>
            <div className="max-h-[70vh] overflow-y-auto overflow-x-hidden scrollbar-thin scrollbar-thumb-gray-300 scrollbar-track-gray-100 hover:scrollbar-thumb-gray-400">
              {logs.length > 0 ? (
                <div className="divide-y">
                  {logs.map((log) => (
                    <div key={log.id} className="p-4 hover:bg-gray-50 transition-colors duration-150">
                      <div className="flex items-start justify-between">
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center space-x-2">
                            <span className={`px-2 py-1 rounded text-xs font-medium ${getLogLevelColor(log.level)} flex-shrink-0`}>
                              {log.level}
                            </span>
                            <span className="text-sm font-medium text-gray-900 truncate">{log.event}</span>
                          </div>
                          {log.data && (
                            <div className="mt-2 max-w-full">
                              <pre className="text-xs text-gray-600 bg-gray-50 p-2 rounded overflow-x-auto max-h-32 whitespace-pre-wrap break-words">
                                {JSON.stringify(log.data, null, 2)}
                              </pre>
                            </div>
                          )}
                        </div>
                        <span className="text-xs text-gray-500 ml-4 flex-shrink-0">
                          {new Date(log.timestamp).toLocaleTimeString()}
                        </span>
                      </div>
                    </div>
                  ))}
                </div>
              ) : (
                <div className="p-8 text-center text-gray-500">
                  <p>No logs available</p>
                </div>
              )}
            </div>
          </div>
        )}

        {/* API Tab */}
        {activeTab === 'api' && (
          <div className="space-y-6">
            {/* API Stats Overview */}
            <div className="grid grid-cols-1 lg:grid-cols-5 gap-6">
              <div className="bg-white rounded-lg shadow p-6">
                <h3 className="text-lg font-semibold text-gray-900 mb-4">Total Requests</h3>
                <div className="text-3xl font-bold text-blue-600">{metrics.http?.requests?.total || 0}</div>
                <div className="text-sm text-gray-500 mt-1">All time</div>
              </div>
              <div className="bg-white rounded-lg shadow p-6">
                <h3 className="text-lg font-semibold text-gray-900 mb-4">Active Requests</h3>
                <div className="text-3xl font-bold text-yellow-600">{metrics.http?.requests?.active || 0}</div>
                <div className="text-sm text-gray-500 mt-1">Currently processing</div>
              </div>
              <div className="bg-white rounded-lg shadow p-6">
                <h3 className="text-lg font-semibold text-gray-900 mb-4">Successful</h3>
                <div className="text-3xl font-bold text-green-600">{metrics.http?.responses?.success || 0}</div>
                <div className="text-sm text-gray-500 mt-1">2xx responses</div>
              </div>
              <div className="bg-white rounded-lg shadow p-6">
                <h3 className="text-lg font-semibold text-gray-900 mb-4">Failed</h3>
                <div className="text-3xl font-bold text-red-600">{metrics.http?.responses?.error || 0}</div>
                <div className="text-sm text-gray-500 mt-1">4xx/5xx responses</div>
              </div>
              <div className="bg-white rounded-lg shadow p-6">
                <h3 className="text-lg font-semibold text-gray-900 mb-4">Avg Response</h3>
                <div className="text-3xl font-bold text-purple-600">{Math.round(metrics.http?.requests?.avgResponseTime || 0)}ms</div>
                <div className="text-sm text-gray-500 mt-1">Response time</div>
              </div>
            </div>

            {/* Route Statistics and Active Requests */}
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
              {/* Route Statistics */}
              <div className="bg-white rounded-lg shadow">
                <div className="p-6 border-b">
                  <h3 className="text-lg font-semibold text-gray-900">Route Statistics</h3>
                  <p className="text-sm text-gray-600 mt-1">API endpoint usage and performance</p>
                </div>
                <div className="max-h-[60vh] overflow-y-auto scrollbar-thin scrollbar-thumb-gray-300 scrollbar-track-gray-100 hover:scrollbar-thumb-gray-400">
                  {metrics.http?.routes && metrics.http.routes.size > 0 ? (
                    <div className="divide-y">
                      {Array.from(metrics.http.routes.entries()).map(([route, stats]) => (
                        <div key={route} className="p-4 hover:bg-gray-50 transition-colors duration-150">
                          <div className="flex items-start justify-between">
                            <div className="flex-1">
                              <div className="flex items-center space-x-2">
                                <span className="text-sm font-medium text-gray-900 font-mono">
                                  {route}
                                </span>
                              </div>
                              <div className="text-xs text-gray-500 mt-1">
                                {stats.requests} requests • {stats.errors} errors • {Math.round(stats.avgTime)}ms avg
                              </div>
                            </div>
                            <div className="text-right">
                              <div className="text-sm font-medium text-blue-600">{stats.requests}</div>
                              <div className="text-xs text-gray-500">requests</div>
                            </div>
                          </div>
                        </div>
                      ))}
                    </div>
                  ) : (
                    <div className="p-8 text-center text-gray-500">
                      <p>No route statistics yet</p>
                      <p className="text-sm mt-1">Statistics will appear after API requests are made</p>
                    </div>
                  )}
                </div>
              </div>

              {/* Active Requests */}
              <div className="bg-white rounded-lg shadow">
                <div className="p-6 border-b">
                  <h3 className="text-lg font-semibold text-gray-900">Active Requests</h3>
                  <p className="text-sm text-gray-600 mt-1">Currently processing requests</p>
                </div>
                <div className="max-h-[60vh] overflow-y-auto scrollbar-thin scrollbar-thumb-gray-300 scrollbar-track-gray-100 hover:scrollbar-thumb-gray-400">
                  {metrics.activeRequests?.length > 0 ? (
                    <div className="divide-y">
                      {metrics.activeRequests.map((request, index) => (
                        <div key={`${request.id}-${index}`} className="p-4 hover:bg-gray-50 transition-colors duration-150">
                          <div className="flex items-start justify-between">
                            <div className="flex-1">
                              <div className="flex items-center space-x-2">
                                <span className={`px-2 py-1 rounded text-xs font-medium ${
                                  request.method === 'GET' ? 'bg-blue-100 text-blue-800' :
                                  request.method === 'POST' ? 'bg-green-100 text-green-800' :
                                  request.method === 'PUT' ? 'bg-yellow-100 text-yellow-800' :
                                  request.method === 'DELETE' ? 'bg-red-100 text-red-800' :
                                  'bg-gray-100 text-gray-800'
                                }`}>
                                  {request.method}
                                </span>
                                <span className="text-sm font-medium text-gray-900 truncate">
                                  {request.url}
                                </span>
                              </div>
                              <div className="text-xs text-gray-500 mt-1">
                                IP: {request.ip} • Duration: {Date.now() - request.startTime}ms
                              </div>
                            </div>
                            <div className="text-right">
                              <div className="text-sm font-medium text-yellow-600">Processing</div>
                              <div className="text-xs text-gray-500">
                                {Math.round((Date.now() - request.startTime) / 1000)}s
                              </div>
                            </div>
                          </div>
                        </div>
                      ))}
                    </div>
                  ) : (
                    <div className="p-8 text-center text-gray-500">
                      <p>No active requests</p>
                      <p className="text-sm mt-1">All requests are being processed quickly</p>
                    </div>
                  )}
                </div>
              </div>
            </div>

          </div>
        )}

        {/* Theme Tab */}
        {activeTab === 'theme' && (
          <ThemeEditor />
        )}
      </div>

      {/* Full Sources List Modal */}
      {showFullSourcesList && (
        console.log('Modal should be visible now') ||
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center" style={{zIndex: 9999}}>
          <div className="bg-white rounded-lg max-w-4xl w-full mx-4 max-h-[80vh] overflow-hidden">
            <div className="px-6 py-4 border-b border-gray-200 flex justify-between items-center">
              <h2 className="text-xl font-semibold text-gray-900">
                All RSS Sources ({sourceStats?.total_unique_sources || 0})
              </h2>
              <button
                onClick={() => setShowFullSourcesList(false)}
                className="text-gray-400 hover:text-gray-600 text-2xl"
              >
                ×
              </button>
            </div>
            <div className="p-6 overflow-y-auto max-h-[60vh]">
              {sourcesLoading ? (
                <div className="text-center py-8">
                  <div className="inline-block animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600"></div>
                  <p className="mt-2 text-gray-600">Loading sources...</p>
                </div>
              ) : (
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  {scrapySources.map((source, index) => (
                    <div key={index} className="bg-gray-50 rounded-lg p-4">
                      <div className="flex justify-between items-start mb-2">
                        <h3 className="font-semibold text-gray-900 truncate flex-1">
                          {source.name || source.domain}
                        </h3>
                        <span className="bg-blue-100 text-blue-800 text-xs px-2 py-1 rounded-full ml-2">
                          {source.articles_count} articles
                        </span>
                      </div>
                      <p className="text-sm text-gray-600 mb-2 break-all">
                        {source.feed_url}
                      </p>
                      <div className="flex justify-between text-xs text-gray-500">
                        <span>First: {source.first_scraped ? new Date(source.first_scraped).toLocaleDateString() : 'Never'}</span>
                        <span>Last: {source.last_scraped ? new Date(source.last_scraped).toLocaleDateString() : 'Never'}</span>
                      </div>
                      <div className="mt-1 text-xs">
                        <span className={`px-2 py-1 rounded-full text-xs font-medium ${
                          source.articles_count > 0 
                            ? 'bg-green-100 text-green-800' 
                            : 'bg-gray-100 text-gray-800'
                        }`}>
                          {source.articles_count > 0 ? 'Active' : 'Inactive'}
                        </span>
                      </div>
                    </div>
                  ))}
                </div>
              )}
              {!sourcesLoading && scrapySources.length === 0 && (
                <div className="text-center py-8 text-gray-500">
                  No RSS sources found. Try running news collection first.
                </div>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default MonitoringDashboard;