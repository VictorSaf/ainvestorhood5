import React, { useState, useEffect, useRef } from 'react';
import io from 'socket.io-client';

const MonitoringDashboard = ({ onClose }) => {
  const [metrics, setMetrics] = useState(null);
  const [logs, setLogs] = useState([]);
  const [isConnected, setIsConnected] = useState(false);
  const [activeTab, setActiveTab] = useState('overview');
  const socketRef = useRef(null);

  useEffect(() => {
    // Connect to monitoring WebSocket
    socketRef.current = io('http://localhost:8080');
    
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
    });

    socketRef.current.on('httpMetrics', (data) => {
      setMetrics(prev => prev ? { ...prev, http: data } : null);
    });

    socketRef.current.on('websocketMetrics', (data) => {
      setMetrics(prev => prev ? { ...prev, websocket: data } : null);
    });

    socketRef.current.on('databaseMetrics', (data) => {
      setMetrics(prev => prev ? { ...prev, database: data } : null);
    });

    socketRef.current.on('aiMetrics', (data) => {
      setMetrics(prev => prev ? { ...prev, ai: data } : null);
    });

    socketRef.current.on('scrapyMetrics', (data) => {
      setMetrics(prev => prev ? { ...prev, scrapy: data } : null);
    });

    // Listen for log updates
    socketRef.current.on('log', (logEntry) => {
      setLogs(prev => [logEntry, ...prev.slice(0, 99)]);
    });

    // Fetch initial metrics
    fetchMetrics();

    return () => {
      if (socketRef.current) {
        socketRef.current.disconnect();
      }
    };
  }, []);

  const fetchMetrics = async () => {
    try {
      const response = await fetch('http://localhost:8080/api/monitor/metrics');
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
    <div className="min-h-screen bg-gray-100">
      {/* Header */}
      <div className="bg-white shadow-sm border-b">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex justify-between items-center py-4">
            <div className="flex items-center">
              <h1 className="text-2xl font-bold text-gray-900">System Monitor</h1>
              <div className={`ml-4 flex items-center ${isConnected ? 'text-green-500' : 'text-red-500'}`}>
                <div className={`w-2 h-2 rounded-full ${isConnected ? 'bg-green-500' : 'bg-red-500'} mr-2`}></div>
                <span className="text-sm font-medium">
                  {isConnected ? 'Connected' : 'Disconnected'}
                </span>
              </div>
            </div>
            <div className="flex items-center space-x-4">
              <div className="text-sm text-gray-500">
                Last updated: {new Date().toLocaleTimeString()}
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
      <div className="bg-white border-b">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex space-x-8">
            {['overview', 'system', 'http', 'websocket', 'database', 'ai', 'scrapy', 'logs'].map((tab) => (
              <button
                key={tab}
                onClick={() => setActiveTab(tab)}
                className={`py-2 px-1 border-b-2 font-medium text-sm capitalize ${
                  activeTab === tab
                    ? 'border-blue-500 text-blue-600'
                    : 'border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300'
                }`}
              >
                {tab}
              </button>
            ))}
          </div>
        </div>
      </div>

      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-6">
        {/* Overview Tab */}
        {activeTab === 'overview' && (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
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
          </div>
        )}

        {/* System Tab */}
        {activeTab === 'system' && (
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
                <div className="overflow-x-auto">
                  <table className="min-w-full">
                    <thead>
                      <tr className="border-b">
                        <th className="text-left py-2">Route</th>
                        <th className="text-left py-2">Requests</th>
                        <th className="text-left py-2">Errors</th>
                        <th className="text-left py-2">Avg Time</th>
                      </tr>
                    </thead>
                    <tbody>
                      {Array.from(metrics.http.routes.entries()).map(([route, stats]) => (
                        <tr key={route} className="border-b">
                          <td className="py-2 font-mono text-sm">{route}</td>
                          <td className="py-2">{stats.requests}</td>
                          <td className="py-2 text-red-500">{stats.errors}</td>
                          <td className="py-2">{Math.round(stats.avgTime)}ms</td>
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
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            <div className="bg-white rounded-lg shadow p-6">
              <h3 className="text-lg font-semibold text-gray-900 mb-4">AI Request Stats</h3>
              <div className="space-y-3">
                <div className="flex justify-between">
                  <span className="text-gray-600">Total Requests</span>
                  <span className="font-medium">{metrics.ai?.requests?.total || 0}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-gray-600">Active Requests</span>
                  <span className="font-medium text-blue-500">{metrics.ai?.requests?.active || 0}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-gray-600">Request Errors</span>
                  <span className="font-medium text-red-500">{metrics.ai?.requests?.errors || 0}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-gray-600">Avg Response Time</span>
                  <span className="font-medium">{Math.round(metrics.ai?.avgResponseTime || 0)}ms</span>
                </div>
              </div>
            </div>

            <div className="bg-white rounded-lg shadow p-6">
              <h3 className="text-lg font-semibold text-gray-900 mb-4">Token Usage</h3>
              <div className="space-y-3">
                <div className="flex justify-between">
                  <span className="text-gray-600">Tokens Used</span>
                  <span className="font-medium">{metrics.ai?.tokens?.used?.toLocaleString() || 0}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-gray-600">Estimated Cost</span>
                  <span className="font-medium">${(metrics.ai?.tokens?.cost || 0).toFixed(4)}</span>
                </div>
              </div>
            </div>
          </div>
        )}

        {/* Scrapy Tab */}
        {activeTab === 'scrapy' && (
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            <div className="bg-white rounded-lg shadow p-6">
              <h3 className="text-lg font-semibold text-gray-900 mb-4">Scrapy Status</h3>
              <div className="space-y-3">
                <div className="flex justify-between">
                  <span className="text-gray-600">Status</span>
                  <span className={`font-medium capitalize ${getStatusColor(metrics.scrapy?.status)}`}>
                    {metrics.scrapy?.status || 'idle'}
                  </span>
                </div>
                <div className="flex justify-between">
                  <span className="text-gray-600">Articles Processed</span>
                  <span className="font-medium">{metrics.scrapy?.articlesProcessed || 0}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-gray-600">Errors</span>
                  <span className="font-medium text-red-500">{metrics.scrapy?.errors || 0}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-gray-600">Avg Processing Time</span>
                  <span className="font-medium">{Math.round(metrics.scrapy?.avgProcessingTime || 0)}ms</span>
                </div>
              </div>
            </div>

            <div className="bg-white rounded-lg shadow p-6">
              <h3 className="text-lg font-semibold text-gray-900 mb-4">Last Run</h3>
              <div className="space-y-3">
                <div className="flex justify-between">
                  <span className="text-gray-600">Last Run</span>
                  <span className="font-medium">
                    {metrics.scrapy?.lastRun 
                      ? new Date(metrics.scrapy.lastRun).toLocaleString()
                      : 'Never'
                    }
                  </span>
                </div>
                <div className="flex justify-between">
                  <span className="text-gray-600">Time Since</span>
                  <span className="font-medium">
                    {metrics.scrapy?.lastRun 
                      ? formatUptime(Date.now() - metrics.scrapy.lastRun)
                      : 'N/A'
                    }
                  </span>
                </div>
              </div>
            </div>
          </div>
        )}

        {/* Logs Tab */}
        {activeTab === 'logs' && (
          <div className="bg-white rounded-lg shadow">
            <div className="p-6 border-b">
              <h3 className="text-lg font-semibold text-gray-900">System Logs</h3>
              <p className="text-sm text-gray-600 mt-1">Real-time application logs</p>
            </div>
            <div className="max-h-96 overflow-y-auto">
              {logs.length > 0 ? (
                <div className="divide-y">
                  {logs.map((log) => (
                    <div key={log.id} className="p-4 hover:bg-gray-50">
                      <div className="flex items-start justify-between">
                        <div className="flex-1">
                          <div className="flex items-center space-x-2">
                            <span className={`px-2 py-1 rounded text-xs font-medium ${getLogLevelColor(log.level)}`}>
                              {log.level}
                            </span>
                            <span className="text-sm font-medium text-gray-900">{log.event}</span>
                          </div>
                          {log.data && (
                            <pre className="mt-2 text-xs text-gray-600 bg-gray-50 p-2 rounded overflow-x-auto">
                              {JSON.stringify(log.data, null, 2)}
                            </pre>
                          )}
                        </div>
                        <span className="text-xs text-gray-500 ml-4">
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
      </div>
    </div>
  );
};

export default MonitoringDashboard;