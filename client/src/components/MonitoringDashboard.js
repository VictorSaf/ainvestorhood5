import React, { useState, useEffect, useRef, useMemo, useCallback } from 'react';
import io from 'socket.io-client';
import AIConfigurationTab from './AIConfigurationTab';
import ThemeEditor from './ThemeEditor';
import AdvancedCSSEditor from './AdvancedCSSEditor';
import ScrapingConfiguration from './ScrapingConfiguration';
import { useEditMode } from '../hooks/useEditMode';
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
  // Theme state
  const [theme, setTheme] = useState(null);
  
  // Edit mode
  const { isGlobalEditMode, toggleGlobalEditMode } = useEditMode();
  
  // Load theme from database
  useEffect(() => {
    const loadTheme = async () => {
      try {
        const response = await fetch('http://localhost:8080/api/theme');
        if (response.ok) {
          const themeData = await response.json();
          setTheme(themeData);
        }
      } catch (error) {
        console.error('Failed to load theme:', error);
      }
    };
    
    loadTheme();
    
    // Listen for theme updates from ThemeEditor
    const handleThemeUpdate = (event) => {
      console.log('Theme updated, reloading...', event.detail.theme);
      setTheme(event.detail.theme);
    };
    
    window.addEventListener('themeUpdated', handleThemeUpdate);
    
    // Cleanup
    return () => {
      window.removeEventListener('themeUpdated', handleThemeUpdate);
    };
  }, []);

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
        background: ${theme?.colors?.secondary?.[100] || '#f1f1f1'};
        border-radius: 3px;
      }
      .scrollbar-thin::-webkit-scrollbar-thumb {
        background: ${theme?.colors?.secondary?.[400] || '#c1c1c1'};
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
  const [showErrorModal, setShowErrorModal] = useState(false);
  const [selectedErrors, setSelectedErrors] = useState([]);
  const [streamingActive, setStreamingActive] = useState(false);
  const [websocketStreaming, setWebsocketStreaming] = useState(true);
  // Combine chart data and scales in single state for atomic updates
  const [chartState, setChartState] = useState({
    data: {
      cpu: [],
      memoryUsage: [],
      totalMemory: [],
      memoryGB: []
    },
    scales: {
      cpu: { min: 0, max: 100 },
      memory: { min: 0, max: 100 },
      memoryGB: { min: 0, max: 36 }
    }
  });
  
  // Chart refs to access chart instances directly
  const cpuChartRef = useRef(null);
  const memoryChartRef = useRef(null);
  const memoryGBChartRef = useRef(null);
  
  // Derived values for backward compatibility
  const chartData = chartState.data;
  const chartScales = chartState.scales;
  
  const [historicalDataLoaded, setHistoricalDataLoaded] = useState(false);

  const [scrapySources, setScrapySources] = useState([]);

  // Theme helper functions
  const getThemeColor = (path, fallback) => {
    if (!theme) return fallback;
    const keys = path.split('.');
    let current = theme;
    for (const key of keys) {
      if (current && current[key] !== undefined) {
        current = current[key];
      } else {
        return fallback;
      }
    }
    return current;
  };

  const getComponentStyle = (component, variant = 'default') => {
    return theme?.components?.[component]?.[variant] || {};
  };

  // Generate inline styles from theme
  const createThemedStyle = (styles) => {
    const result = {};
    Object.entries(styles).forEach(([key, value]) => {
      if (typeof value === 'string' && value.startsWith('colors.')) {
        result[key] = getThemeColor(value, value);
      } else {
        result[key] = value;
      }
    });
    return result;
  };
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

    // Listen for real-time metrics updates (ensure we always have a metrics object)
    socketRef.current.on('systemMetrics', (data) => {
      console.log('🔄 Real-time systemMetrics received:', {
        cpu: data.cpu?.usage,
        memory: data.memory?.percentage,
        timestamp: new Date().toLocaleTimeString(),
        fullData: data
      });
      
      // Simple memory debug
      console.log('📈 MEMORY UPDATE:', data.memory?.percentage + '%', 'at', new Date().toLocaleTimeString());
      
      setMetrics(prev => {
        const updated = prev ? { ...prev, system: data } : { system: data };
        console.log('📊 setMetrics called with system data:', {
          prevCpu: prev?.system?.cpu?.usage,
          newCpu: data.cpu?.usage,
          prevMemory: prev?.system?.memory?.percentage,
          newMemory: data.memory?.percentage
        });
        return updated;
      });
      
      setLastUpdate(new Date());
      setStreamingActive(true);
      setTimeout(() => setStreamingActive(false), 500);

      // Update charts directly using Chart.js API to avoid recreation flickering
      const now = new Date();
      
      // Validate incoming values to prevent anomalous data
      let cpuUsage = data.cpu?.usage || 0;
      let memoryPercentage = data.memory?.percentage || 0;
      
      // Sanitize CPU usage (should be between 0-100)
      cpuUsage = Math.max(0, Math.min(100, cpuUsage));
      
      // Sanitize memory percentage (should be between 0-100)
      memoryPercentage = Math.max(0, Math.min(100, memoryPercentage));
      
      console.log('💫 DIRECT CHART UPDATE - CPU:', cpuUsage, 'Memory:', memoryPercentage);
      
      // Update charts directly without state recreation
      updateChartsDirectly({
        cpu: cpuUsage,
        memory: memoryPercentage,
        memoryGB: data.memory?.used ? (data.memory.used / (1024 * 1024 * 1024)) : 0,
        timestamp: now
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
      
      // Trigger WebSocket tab streaming indicator
      if (websocketStreaming) {
        // Create a visual pulse effect specifically for WebSocket data updates
        setTimeout(() => {
          const wsCards = document.querySelectorAll('.websocket-card');
          wsCards.forEach(card => {
            card.classList.add('websocket-pulse');
            setTimeout(() => card.classList.remove('websocket-pulse'), 300);
          });
        }, 50);
      }
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


    // Fetch initial metrics and historical data
    fetchMetrics();
    fetchSystemMetrics();

    // Refresh metrics every 5 seconds as fallback (only general metrics, not system data)
    const refreshInterval = setInterval(() => {
      if (isConnected) {
        fetchMetrics();
        // Don't call fetchSystemMetrics() here to avoid overwriting real-time data
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
    if (activeTab === 'scrapping') {
      fetchScrapySources();
    }
  }, [activeTab]);

  const handleErrorClick = (errorType) => {
    if (!metrics?.http?.errorDetails) return;
    
    setSelectedErrors(metrics.http.errorDetails);
    setShowErrorModal(true);
  };

  const formatErrorTime = (timestamp) => {
    return new Date(timestamp).toLocaleString();
  };

  const fetchMetrics = async () => {
    try {
      const response = await fetch('/api/monitor/metrics');
      const data = await response.json();
      
      // Don't overwrite system metrics if we have real-time streaming data
      setMetrics(prev => {
        if (prev?.system && historicalDataLoaded) {
          // Keep real-time system data, update everything else
          return {
            ...data,
            system: prev.system  // Preserve streaming system metrics
          };
        }
        return data;
      });
      
      setLogs(data.recentLogs || []);
      console.log('📊 fetchMetrics: Preserved real-time system data, updated other metrics');
    } catch (error) {
      console.error('Failed to fetch metrics:', error);
    }
  };

  const fetchSystemMetrics = async () => {
    try {
      // Only load historical data if not already loaded
      if (historicalDataLoaded) {
        console.log('⏭️ Skipping system metrics fetch - historical data already loaded');
        return;
      }

      console.log('📥 Loading initial system metrics and historical data...');
      const response = await fetch('/api/monitoring/system');
      const data = await response.json();
      
      // Update metrics with real system data (only if no real-time data exists)
      setMetrics(prev => {
        if (!prev?.system) {
          return {
            ...prev,
            system: data.system,
            app: data.app
          };
        }
        return prev;
      });
      
      // Populate charts with historical data (only on initial load)
      if (data.history && data.history.cpu && data.history.memory) {
        console.log('📊 Loading historical chart data:', {
          cpuPoints: data.history.cpu?.length,
          memoryPoints: data.history.memory?.length
        });
        
        const historicalChartData = {
          cpu: data.history.cpu.map(point => ({
            x: new Date(point.timestamp).toISOString(),
            y: Math.max(0, Math.min(100, point.value || 0)) // Sanitize CPU values
          })),
          memoryUsage: data.history.memory.map(point => ({
            x: new Date(point.timestamp).toISOString(),
            y: Math.max(0, Math.min(100, point.value || 0)) // Sanitize memory values
          })),
          totalMemory: data.history.memory.map(point => ({
            x: new Date(point.timestamp).toISOString(),
            y: (data.system?.memory?.total || 38654705664) / (1024 * 1024 * 1024) // Static total memory in GB
          })),
          memoryGB: data.history.memory.map(point => ({
            x: new Date(point.timestamp).toISOString(),
            y: ((data.system?.memory?.total || 38654705664) * (point.value / 100)) / (1024 * 1024 * 1024) // Calculate used memory in GB
          }))
        };
        
        console.log('📈 Loading historical chart data:', {
          cpuPoints: historicalChartData.cpu.length,
          memoryPoints: historicalChartData.memoryUsage.length,
          memoryValueRange: {
            min: Math.min(...historicalChartData.memoryUsage.map(p => p.y)),
            max: Math.max(...historicalChartData.memoryUsage.map(p => p.y)),
            last5: historicalChartData.memoryUsage.slice(-5).map(p => p.y)
          }
        });
        
        // Calculate scales and set combined state atomically
        const historicalCpuScale = calculateDynamicScale(historicalChartData.cpu);
        const historicalMemoryScale = calculateDynamicScale(historicalChartData.memoryUsage);
        const historicalMemoryGBScale = calculateDynamicScaleGB(historicalChartData.memoryGB);
        
        // Set combined state in single atomic operation
        setChartState({
          data: historicalChartData,
          scales: {
            cpu: historicalCpuScale,
            memory: historicalMemoryScale,
            memoryGB: historicalMemoryGBScale
          }
        });
        
        setHistoricalDataLoaded(true);
        console.log('✅ Historical data loaded successfully');
      }
    } catch (error) {
      console.error('Failed to fetch system metrics:', error);
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

  // Calculate dynamic scale for charts  
  // Direct chart update function to avoid recreation flickering
  const updateChartsDirectly = useCallback((newData) => {
    const { cpu, memory, memoryGB, timestamp } = newData;
    
    console.log('🚀 DIRECT UPDATE START:', { cpu, memory, memoryGB });
    
    // Update CPU chart
    if (cpuChartRef.current) {
      const cpuChart = cpuChartRef.current;
      const cpuDataset = cpuChart.data.datasets[0];
      
      // Add new data point
      cpuDataset.data.push({ x: timestamp, y: cpu });
      
      // Keep only recent data points
      if (cpuDataset.data.length > maxDataPoints) {
        cpuDataset.data.shift();
      }
      
      // Calculate and update scale
      const newCpuScale = calculateDynamicScale(cpuDataset.data);
      cpuChart.options.scales.y.min = newCpuScale.min;
      cpuChart.options.scales.y.max = newCpuScale.max;
      
      console.log('📊 CPU chart updated directly - Scale:', newCpuScale);
      cpuChart.update('none'); // Update without animation
    }
    
    // Update Memory chart
    if (memoryChartRef.current) {
      const memoryChart = memoryChartRef.current;
      const memoryDataset = memoryChart.data.datasets[0];
      
      // Add new data point
      memoryDataset.data.push({ x: timestamp, y: memory });
      
      // Keep only recent data points
      if (memoryDataset.data.length > maxDataPoints) {
        memoryDataset.data.shift();
      }
      
      // Calculate and update scale
      const newMemoryScale = calculateDynamicScale(memoryDataset.data);
      memoryChart.options.scales.y.min = newMemoryScale.min;
      memoryChart.options.scales.y.max = newMemoryScale.max;
      
      console.log('📊 Memory chart updated directly - Scale:', newMemoryScale);
      memoryChart.update('none'); // Update without animation
    }
    
    // Update Memory GB chart
    if (memoryGBChartRef.current) {
      const memoryGBChart = memoryGBChartRef.current;
      const memoryGBDataset = memoryGBChart.data.datasets[0];
      
      // Add new data point
      memoryGBDataset.data.push({ x: timestamp, y: memoryGB });
      
      // Keep only recent data points
      if (memoryGBDataset.data.length > maxDataPoints) {
        memoryGBDataset.data.shift();
      }
      
      // Calculate and update scale
      const newMemoryGBScale = calculateDynamicScaleGB(memoryGBDataset.data);
      memoryGBChart.options.scales.y.min = newMemoryGBScale.min;
      memoryGBChart.options.scales.y.max = newMemoryGBScale.max;
      
      console.log('📊 Memory GB chart updated directly - Scale:', newMemoryGBScale);
      memoryGBChart.update('none'); // Update without animation
    }
    
    // Also update state for backup (but this won't cause chart recreation)
    setChartState(prev => ({
      data: {
        cpu: [...prev.data.cpu, { x: timestamp.toISOString(), y: cpu }].slice(-maxDataPoints),
        memoryUsage: [...prev.data.memoryUsage, { x: timestamp.toISOString(), y: memory }].slice(-maxDataPoints),
        totalMemory: [...prev.data.totalMemory, { x: timestamp.toISOString(), y: 36 }].slice(-maxDataPoints),
        memoryGB: [...prev.data.memoryGB, { x: timestamp.toISOString(), y: memoryGB }].slice(-maxDataPoints)
      },
      scales: {
        cpu: calculateDynamicScale([...prev.data.cpu, { x: timestamp.toISOString(), y: cpu }].slice(-maxDataPoints)),
        memory: calculateDynamicScale([...prev.data.memoryUsage, { x: timestamp.toISOString(), y: memory }].slice(-maxDataPoints)),
        memoryGB: calculateDynamicScaleGB([...prev.data.memoryGB, { x: timestamp.toISOString(), y: memoryGB }].slice(-maxDataPoints))
      }
    }));
    
    console.log('✅ ALL CHARTS UPDATED DIRECTLY');
  }, [maxDataPoints]);

  const calculateDynamicScale = (data, padding = 10) => {
    if (!data || data.length === 0) {
      return { min: 0, max: 100 };
    }

    const values = data.map(point => point.y).filter(val => val != null && !isNaN(val));
    if (values.length === 0) {
      return { min: 0, max: 100 };
    }

    const minValue = Math.min(...values);
    const maxValue = Math.max(...values);
    
    // Add padding but keep natural scale
    const range = maxValue - minValue;
    const paddingAmount = Math.max(range * (padding / 100), 2); // Minimum 2% padding
    
    let min = minValue - paddingAmount;
    let max = maxValue + paddingAmount;
    
    // Ensure minimum range for readability
    if (max - min < 8) {
      const center = (max + min) / 2;
      min = center - 4;
      max = center + 4;
    }
    
    // IMPORTANT: Don't force toward zero - only limit if values are actually outside bounds
    // Only apply 0 limit if the calculated min is very close to 0 (within 5%)
    if (min >= 0 && min <= 5 && minValue >= 0) {
      min = 0;
    } else if (min < 0 && minValue >= 0) {
      min = Math.max(0, minValue - 2); // Keep natural lower bound
    }
    
    // Only apply 100% limit for percentage values if max is very close to 100
    if (max <= 100 && max >= 95 && maxValue <= 100) {
      max = 100;
    } else if (max > 100 && maxValue <= 100) {
      max = Math.min(100, maxValue + 2); // Keep natural upper bound
    }
    
    // Round to nice numbers
    min = Math.floor(min);
    max = Math.ceil(max);
    
    
    return { min, max };
  };

  // Calculate dynamic scale for memory GB charts
  const calculateDynamicScaleGB = (data, padding = 10) => {
    if (!data || data.length === 0) {
      return { min: 0, max: 36 };
    }

    const values = data.map(point => point.y).filter(val => val != null && val >= 0 && !isNaN(val));
    if (values.length === 0) {
      return { min: 0, max: 36 };
    }

    const minValue = Math.min(...values);
    const maxValue = Math.max(...values);
    
    // Add padding but preserve natural scale
    const range = maxValue - minValue;
    const paddingAmount = Math.max(range * (padding / 100), 1); // Minimum 1GB padding
    
    let min = minValue - paddingAmount;
    let max = maxValue + paddingAmount;
    
    // Ensure minimum range
    if (max - min < 3) {
      const center = (max + min) / 2;
      min = center - 1.5;
      max = center + 1.5;
    }
    
    // IMPORTANT: Don't force toward zero - only limit if values are very low
    // Only apply 0 limit if the calculated min is very close to 0 (within 2GB) and all values are low
    if (min >= 0 && min <= 2 && minValue <= 5) {
      min = 0;
    } else if (min < 0) {
      min = Math.max(0, minValue - 1); // Keep natural lower bound
    }
    
    // Don't impose upper limit unless values are close to system max
    if (max > 40) {
      max = Math.min(40, maxValue + 2);
    }
    
    // Round to nice numbers (0.5GB increments)
    min = Math.floor(min * 2) / 2;
    max = Math.ceil(max * 2) / 2;
    
    return { min, max };
  };


  // Memoized chart options to prevent unnecessary re-renders
  const cpuChartOptions = useMemo(() => {
    console.log('🔵 CHART RENDER: CPU options recalculated with scales:', chartScales.cpu);
    return {
    responsive: true,
    maintainAspectRatio: false,
    animation: false, // DISABLE ALL ANIMATIONS TO PREVENT FLICKERING
    transitions: {
      active: { animation: { duration: 0 } },
      resize: { animation: { duration: 0 } },
      show: { animation: { duration: 0 } },
      hide: { animation: { duration: 0 } }
    },
    plugins: {
      legend: { display: false },
      title: { display: false },
    },
    scales: {
      x: {
        type: 'time',
        time: {
          unit: 'minute',
          displayFormats: { minute: 'HH:mm' }
        },
        ticks: { maxTicksLimit: 6 },
      },
      y: {
        min: chartScales.cpu.min,
        max: chartScales.cpu.max,
        ticks: {
          callback: function(value) {
            return value + '%';
          },
        },
      },
    },
    elements: {
      line: { tension: 0.4 },
    },
    };
  }, [chartScales.cpu.min, chartScales.cpu.max]);

  const memoryChartOptions = useMemo(() => {
    console.log('🔵 CHART RENDER: Memory options recalculated with scales:', chartScales.memory);
    return {
    responsive: true,
    maintainAspectRatio: false,
    animation: false, // DISABLE ALL ANIMATIONS TO PREVENT FLICKERING
    transitions: {
      active: { animation: { duration: 0 } },
      resize: { animation: { duration: 0 } },
      show: { animation: { duration: 0 } },
      hide: { animation: { duration: 0 } }
    },
    plugins: {
      legend: { display: false },
      title: { display: false },
    },
    scales: {
      x: {
        type: 'time',
        time: {
          unit: 'minute',
          displayFormats: { minute: 'HH:mm' }
        },
        ticks: { maxTicksLimit: 6 },
      },
      y: {
        min: chartScales.memory.min,
        max: chartScales.memory.max,
        ticks: {
          callback: function(value) {
            return value + '%';
          },
        },
      },
    },
    elements: {
      line: { tension: 0.4 },
    },
    };
  }, [chartScales.memory.min, chartScales.memory.max]);

  const memoryGBChartOptions = useMemo(() => ({
    responsive: true,
    maintainAspectRatio: false,
    animation: false, // DISABLE ALL ANIMATIONS TO PREVENT FLICKERING
    transitions: {
      active: { animation: { duration: 0 } },
      resize: { animation: { duration: 0 } },
      show: { animation: { duration: 0 } },
      hide: { animation: { duration: 0 } }
    },
    plugins: {
      legend: { display: false },
      title: { display: false },
    },
    scales: {
      x: {
        type: 'time',
        time: {
          unit: 'minute',
          displayFormats: { minute: 'HH:mm' }
        },
        ticks: { maxTicksLimit: 6 },
      },
      y: {
        min: chartScales.memoryGB.min,
        max: chartScales.memoryGB.max,
        ticks: {
          callback: function(value) {
            return value.toFixed(1) + ' GB';
          },
        },
      },
    },
    elements: {
      line: { tension: 0.4 },
    },
  }), [chartScales.memoryGB.min, chartScales.memoryGB.max]);

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
      <div 
        className="min-h-screen flex items-center justify-center"
        style={{ 
          background: getThemeColor('colors.secondary.50', '#f8fafc')
        }}
      >
        <div className="text-center">
          <div 
            className="animate-spin rounded-full h-12 w-12 border-b-2 mx-auto"
            style={{ 
              borderColor: getThemeColor('colors.primary.500', '#3b82f6')
            }}
          ></div>
          <p 
            className="mt-4"
            style={{ 
              color: getThemeColor('colors.secondary.600', '#475569')
            }}
          >
            Loading monitoring dashboard...
          </p>
        </div>
      </div>
    );
  }

  const headerStyle = getComponentStyle('header', 'container');
  const titleStyle = getComponentStyle('header', 'title');
  const cardStyle = getComponentStyle('card', 'default');

  return (
    <div 
      className="h-full flex flex-col"
      style={{ 
        background: getThemeColor('colors.secondary.50', '#f8fafc')
      }}
    >
      {/* Header */}
      <div 
        className="shadow-sm border-b"
        style={{
          background: headerStyle.background || '#ffffff',
          backdropFilter: headerStyle.backdropFilter,
          borderColor: getThemeColor('colors.secondary.200', '#e5e7eb')
        }}
      >
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex justify-between items-center py-4">
            <div className="flex items-center">
              <h1 
                className="text-2xl font-bold"
                style={{
                  fontSize: titleStyle.fontSize || '1.25rem',
                  fontWeight: titleStyle.fontWeight || '700',
                  background: titleStyle.background,
                  backgroundClip: titleStyle.backgroundClip,
                  WebkitBackgroundClip: titleStyle.backgroundClip,
                  color: titleStyle.color || getThemeColor('colors.secondary.900', '#0f172a')
                }}
              >
                System Monitor
              </h1>
              <div className="ml-4 flex items-center">
                <div 
                  className={`w-2 h-2 rounded-full mr-2 ${streamingActive ? 'animate-pulse' : ''}`}
                  style={{
                    backgroundColor: isConnected 
                      ? getThemeColor('colors.success.500', '#22c55e')
                      : getThemeColor('colors.danger.500', '#ef4444')
                  }}
                ></div>
                <span 
                  className="text-sm font-medium"
                  style={{
                    color: isConnected 
                      ? getThemeColor('colors.success.600', '#16a34a')
                      : getThemeColor('colors.danger.600', '#dc2626')
                  }}
                >
                  {isConnected ? 'Live Stream' : 'Disconnected'}
                </span>
                {streamingActive && (
                  <span 
                    className="ml-2 text-xs px-2 py-1 rounded-full animate-pulse"
                    style={{
                      backgroundColor: getThemeColor('colors.success.100', '#dcfce7'),
                      color: getThemeColor('colors.success.800', '#166534')
                    }}
                  >
                    Updating...
                  </span>
                )}
              </div>
            </div>
            <div className="flex items-center space-x-4">
              <div 
                className="text-sm"
                style={{ 
                  color: getThemeColor('colors.secondary.500', '#64748b')
                }}
              >
                Last updated: {lastUpdate.toLocaleTimeString()}
              </div>
              <div className="flex items-center space-x-2">
                <div 
                  className={`w-1 h-1 rounded-full ${isConnected ? 'animate-pulse' : ''}`}
                  style={{
                    backgroundColor: isConnected 
                      ? getThemeColor('colors.success.400', '#4ade80')
                      : getThemeColor('colors.secondary.400', '#94a3b8')
                  }}
                ></div>
                <span 
                  className="text-xs"
                  style={{ 
                    color: getThemeColor('colors.secondary.400', '#94a3b8')
                  }}
                >
                  {isConnected ? 'Real-time' : 'Offline'}
                </span>
              </div>
              <button
                onClick={toggleGlobalEditMode}
                className="transition-colors mr-4"
                style={{
                  color: isGlobalEditMode ? '#3b82f6' : getThemeColor('colors.secondary.400', '#94a3b8'),
                  background: isGlobalEditMode ? '#e3f2fd' : 'transparent',
                  padding: '8px',
                  borderRadius: '6px',
                  border: 'none'
                }}
                title={isGlobalEditMode ? "Exit Edit Mode" : "Enter Edit Mode"}
                onMouseEnter={(e) => {
                  if (!isGlobalEditMode) {
                    e.target.style.color = getThemeColor('colors.secondary.600', '#475569');
                  }
                }}
                onMouseLeave={(e) => {
                  e.target.style.color = isGlobalEditMode ? '#3b82f6' : getThemeColor('colors.secondary.400', '#94a3b8');
                }}
              >
                🎨
              </button>
              {onClose && (
                <button
                  onClick={onClose}
                  className="transition-colors"
                  style={{
                    color: getThemeColor('colors.secondary.400', '#94a3b8')
                  }}
                  onMouseEnter={(e) => {
                    e.target.style.color = getThemeColor('colors.secondary.600', '#475569');
                  }}
                  onMouseLeave={(e) => {
                    e.target.style.color = getThemeColor('colors.secondary.400', '#94a3b8');
                  }}
                >
                  ✕
                </button>
              )}
            </div>
          </div>
        </div>
      </div>

      {/* Navigation Tabs */}
      <div 
        className="border-b flex-shrink-0"
        style={{
          background: cardStyle.background || '#ffffff',
          borderColor: getThemeColor('colors.secondary.200', '#e5e7eb')
        }}
      >
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex space-x-8">
            {['overview', 'system', 'http', 'websocket', 'database', 'ai', 'scrapping', 'api', 'logs', 'theme', 'csseditor'].map((tab) => {
              const isActive = activeTab === tab;
              return (
                <button
                  key={tab}
                  onClick={() => setActiveTab(tab)}
                  className="py-2 px-1 border-b-2 font-medium text-sm capitalize transition-colors"
                  style={{
                    borderBottomColor: isActive 
                      ? getThemeColor('colors.primary.500', '#3b82f6')
                      : 'transparent',
                    color: isActive 
                      ? getThemeColor('colors.primary.600', '#2563eb')
                      : getThemeColor('colors.secondary.500', '#64748b'),
                    fontWeight: isActive ? '600' : '500'
                  }}
                  onMouseEnter={(e) => {
                    if (!isActive) {
                      e.target.style.color = getThemeColor('colors.secondary.700', '#334155');
                      e.target.style.borderBottomColor = getThemeColor('colors.secondary.300', '#cbd5e1');
                    }
                  }}
                  onMouseLeave={(e) => {
                    if (!isActive) {
                      e.target.style.color = getThemeColor('colors.secondary.500', '#64748b');
                      e.target.style.borderBottomColor = 'transparent';
                    }
                  }}
                >
                  {tab === 'api' ? 'API' : 
                   tab === 'ai' ? 'AI' : 
                   tab === 'scrapping' ? 'Scrapping' :
                   tab === 'csseditor' ? 'CSS Editor' :
                   tab}
                </button>
              );
            })}
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
              <div className="space-y-4">
                <div>
                  <div className="flex justify-between text-sm mb-1">
                    <span className="text-gray-600">CPU</span>
                    <span className="font-medium">{metrics.system?.cpu?.usage || 0}%</span>
                  </div>
                  <div className="w-full h-24 bg-gray-50 rounded border">
                    <canvas ref={miniCpuRef} style={{ width: '100%', height: '100%' }} />
                  </div>
                </div>
                <div className="flex justify-between">
                  <span className="text-gray-600">Memory</span>
                  <span className="font-medium">{console.log('💻 UI MEMORY DISPLAY:', metrics.system?.memory?.percentage) || (metrics.system?.memory?.percentage || 0)}%</span>
                </div>
                <div>
                  <div className="flex justify-between text-sm mb-1">
                    <span className="text-gray-600">GPU</span>
                    <span className="font-medium">{metrics.system?.gpu?.usage || 0}%</span>
                  </div>
                  <div className="w-full h-24 bg-gray-50 rounded border">
                    <canvas ref={miniGpuRef} style={{ width: '100%', height: '100%' }} />
                  </div>
                </div>
                <div className="flex justify-between text-sm">
                  <span className="text-gray-600">Uptime</span>
                  <span className="font-medium">{formatUptime((metrics.system?.uptime || 0) * 1000)}</span>
                </div>
              </div>
            </div>

            {/* HTTP Overview */}
            <div className="bg-white rounded-lg shadow p-6">
              <h3 className="text-lg font-semibold text-gray-900 mb-2">HTTP</h3>
              <div className="flex items-center justify-between text-sm mb-1">
                <span className="text-gray-600">Active</span>
                <span className="font-medium">{metrics.http?.requests?.active || 0}</span>
              </div>
              <div className="w-full h-10 bg-gray-50 rounded border mb-3">
                <canvas ref={miniHttpRef} style={{ width: '100%', height: '100%' }} />
              </div>
              <div className="flex justify-between text-xs text-gray-600">
                <span>Total: {metrics.http?.requests?.total || 0}</span>
                <span className="text-red-500">Errors: {metrics.http?.requests?.errors || 0}</span>
              </div>
            </div>

            {/* Database Overview */}
            <div className="bg-white rounded-lg shadow p-6">
              <h3 className="text-lg font-semibold text-gray-900 mb-2">Database</h3>
              <div className="flex items-center justify-between text-sm mb-1">
                <span className="text-gray-600">Active</span>
                <span className="font-medium">{metrics.database?.queries?.active || 0}</span>
              </div>
              <div className="w-full h-10 bg-gray-50 rounded border mb-3">
                <canvas ref={miniDbRef} style={{ width: '100%', height: '100%' }} />
              </div>
              <div className="flex justify-between text-xs text-gray-600">
                <span>Total: {metrics.database?.queries?.total || 0}</span>
                <span>Avg: {Math.round(metrics.database?.queries?.avgTime || 0)}ms</span>
              </div>
            </div>

            {/* AI Overview */}
            <div className="bg-white rounded-lg shadow p-6">
              <h3 className="text-lg font-semibold text-gray-900 mb-2">AI Service</h3>
              <div className="flex items-center justify-between text-sm mb-1">
                <span className="text-gray-600">Avg RT</span>
                <span className="font-medium">{Math.round(metrics.ai?.avgResponseTime || 0)}ms</span>
              </div>
              <div className="w-full h-10 bg-gray-50 rounded border mb-3">
                <canvas ref={miniAiRef} style={{ width: '100%', height: '100%' }} />
              </div>
              <div className="flex justify-between text-xs text-gray-600">
                <span>Req: {metrics.ai?.requests?.total || 0}</span>
                <span>Tokens: {metrics.ai?.tokens?.used?.toLocaleString() || 0}</span>
              </div>
            </div>

            {/* WebSocket Overview */}
            <div className="bg-white rounded-lg shadow p-6">
              <h3 className="text-lg font-semibold text-gray-900 mb-2">WebSocket</h3>
              <div className="flex items-center justify-between text-sm mb-1">
                <span className="text-gray-600">Active</span>
                <span className="font-medium">{metrics.websocket?.connections?.active || 0}</span>
              </div>
              <div className="w-full h-10 bg-gray-50 rounded border mb-3">
                <canvas ref={miniWsRef} style={{ width: '100%', height: '100%' }} />
              </div>
              <div className="flex justify-between text-xs text-gray-600">
                <span>Total: {metrics.websocket?.connections?.total || 0}</span>
                <span>Msgs: {(metrics.websocket?.messages?.sent || 0) + (metrics.websocket?.messages?.received || 0)}</span>
              </div>
            </div>

            {/* Scrapping Overview */}
            <div className="bg-white rounded-lg shadow p-6">
              <h3 className="text-lg font-semibold text-gray-900 mb-2">Scrapping</h3>
              <div className="flex items-center justify-between text-sm mb-1">
                <span className="text-gray-600">Articles (last run)</span>
                <span className="font-medium">{metrics.scrapy?.lastRunArticles || 0}</span>
              </div>
              <div className="w-full h-10 bg-gray-50 rounded border mb-3">
                <canvas ref={miniScrapRef} style={{ width: '100%', height: '100%' }} />
              </div>
              <div className="flex justify-between text-xs text-gray-600">
                <span>Status: {metrics.scrapy?.status || 'idle'}</span>
                <span className="text-red-500">Err: {metrics.scrapy?.lastRunErrors || 0}</span>
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
                <h3 className="text-lg font-semibold text-gray-900 mb-4">
                  CPU Usage ({chartScales.cpu.min}% - {chartScales.cpu.max}%) - Last 2 Hours
                </h3>
                <div className="h-64">
                  <Line
                    ref={cpuChartRef}
                    data={{
                      datasets: [
                        {
                          label: 'CPU Usage (%)',
                          data: chartData.cpu,
                          borderColor: getThemeColor('colors.primary.500', '#3b82f6'),
                          backgroundColor: getThemeColor('colors.primary.50', 'rgba(59, 130, 246, 0.1)'),
                          tension: 0.1,
                          pointRadius: 0,
                          borderWidth: 2,
                        },
                      ],
                    }}
                    options={cpuChartOptions}
                  />
                </div>
              </div>

              {/* Memory Usage Chart */}
              <div className="bg-white rounded-lg shadow p-6">
                <h3 className="text-lg font-semibold text-gray-900 mb-4">
                  Memory Usage ({chartScales.memory.min}% - {chartScales.memory.max}%) - Last 2 Hours
                </h3>
                <div className="h-64">
                  <Line
                    ref={memoryChartRef}
                    data={{
                      datasets: [
                        {
                          label: 'Memory Usage (%)',
                          data: chartData.memoryUsage,
                          borderColor: getThemeColor('colors.success.500', '#22c55e'),
                          backgroundColor: getThemeColor('colors.success.50', 'rgba(34, 197, 94, 0.1)'),
                          tension: 0.1,
                          pointRadius: 0,
                          borderWidth: 2,
                        },
                      ],
                    }}
                    options={memoryChartOptions}
                  />
                </div>
              </div>

              {/* Memory Usage in GB Chart */}
              <div className="bg-white rounded-lg shadow p-6">
                <h3 className="text-lg font-semibold text-gray-900 mb-4">
                  Memory Usage ({chartScales.memoryGB.min}GB - {chartScales.memoryGB.max}GB) - Last 2 Hours
                </h3>
                <div className="h-64">
                  <Line
                    ref={memoryGBChartRef}
                    data={{
                      datasets: [
                        {
                          label: 'Used Memory (GB)',
                          data: chartData.memoryGB,
                          borderColor: 'rgb(168, 85, 247)',
                          backgroundColor: 'rgba(168, 85, 247, 0.1)',
                          tension: 0.1,
                          pointRadius: 0,
                          borderWidth: 2,
                        },
                      ],
                    }}
                    options={memoryGBChartOptions}
                  />
                </div>
              </div>
            </div>
          </div>
        )}

        {/* HTTP Tab */}
        {activeTab === 'http' && (
          <div className="space-y-6">
            <div className="grid grid-cols-1 gap-6">
              <div className="bg-white rounded-lg shadow p-6">
                <h3 className="text-lg font-semibold text-gray-900 mb-2">Top Endpoints by Requests</h3>
                {(() => { const routeEntries = getEntries(metrics?.http?.routes); return routeEntries.length > 0 ? (
                  <div className="h-72">
                    <Bar
                      data={{
                        labels: routeEntries.sort((a,b)=> (b[1]?.requests||0)-(a[1]?.requests||0)).slice(0,12).map(([route])=>route),
                        datasets: [{ label: 'Requests', data: routeEntries.sort((a,b)=> (b[1]?.requests||0)-(a[1]?.requests||0)).slice(0,12).map(([,s])=> (s?.requests||0)), backgroundColor: 'rgba(14,165,233,0.6)' }]
                      }}
                      options={{ responsive: true, maintainAspectRatio: false, plugins: { legend: { display: false } }, scales: { x: { ticks: { autoSkip: false, maxRotation: 35 } }, y: { beginAtZero: true, ticks: { precision: 0 } } } }}
                    />
                  </div>
                ) : (<p className="text-sm text-gray-500">No route data</p>) })()}
              </div>
              <div className="bg-white rounded-lg shadow p-6">
                <h3 className="text-lg font-semibold text-gray-900 mb-2">Top Endpoints by Errors</h3>
                {(() => { const routeEntries = getEntries(metrics?.http?.routes); return routeEntries.length > 0 ? (
                  <div className="h-72">
                    <Bar
                      data={{
                        labels: routeEntries.sort((a,b)=> (b[1]?.errors||0)-(a[1]?.errors||0)).slice(0,12).map(([route])=>route),
                        datasets: [{ label: 'Errors', data: routeEntries.sort((a,b)=> (b[1]?.errors||0)-(a[1]?.errors||0)).slice(0,12).map(([,s])=> (s?.errors||0)), backgroundColor: 'rgba(239,68,68,0.6)' }]
                      }}
                      options={{ responsive: true, maintainAspectRatio: false, plugins: { legend: { display: false } }, scales: { x: { ticks: { autoSkip: false, maxRotation: 35 } }, y: { beginAtZero: true, ticks: { precision: 0 } } } }}
                    />
                  </div>
                  <div className="flex justify-between">
                    <span className="text-gray-600">Error</span>
                    <span 
                      className="font-medium text-red-500 cursor-pointer hover:text-red-700 hover:underline" 
                      onClick={() => handleErrorClick('responses')}
                    >
                      {metrics.http?.responses?.error || 0}
                    </span>
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
            {metrics.http?.routes && Object.keys(metrics.http.routes).length > 0 && (
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
                      {Object.entries(metrics.http.routes).map(([route, stats]) => (
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
            ) : null })()}
          </div>
        )}
        {/* System Tab removed as requested */}

        {/* HTTP Tab */}
        {activeTab === 'http' && (
          <div className="space-y-6">
            <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
              {/* KPIs */}
              <div className="bg-white rounded-lg shadow p-6">
                <h3 className="text-lg font-semibold text-gray-900 mb-2">KPIs (last 10m)</h3>
                <div className="grid grid-cols-3 gap-4 text-center">
                  <div>
                    <div className="text-xs text-gray-500">Active</div>
                    <div className="text-2xl font-semibold text-blue-600">{metrics.http?.requests?.active || 0}</div>
                  </div>
                  <div>
                    <div className="text-xs text-gray-500">Errors</div>
                    <div className="text-2xl font-semibold text-red-600">{metrics.http?.requests?.errors || 0}</div>
                  </div>
                  <div>
                    <div className="text-xs text-gray-500">Avg RT</div>
                    <div className="text-2xl font-semibold text-indigo-600">{Math.round(metrics.http?.requests?.avgResponseTime || 0)}ms</div>
                  </div>
                </div>
              </div>
              {/* Bar charts (bucketed 1m) */}
              <div className="bg-white rounded-lg shadow p-6 lg:col-span-2">
                <h3 className="text-lg font-semibold text-gray-900 mb-2">Last 10 minutes</h3>
                <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                  <div className="h-56">
                    <Bar data={makeBarDataset('httpActive','Active','rgba(14,165,233,0.7)')}
                      options={{ responsive:true, maintainAspectRatio:false, plugins:{ legend:{display:false} }, scales:{ y:{ beginAtZero:true, ticks:{ precision:0 } } },
                        onClick: (evt, elements)=>{ if (!elements?.length) return; const el=elements[0]; const d=el.dataset; const idx=el.index; openBucketDetails('HTTP Active', d.bucketStartTs[idx], d.bucketMs, ['httpActive']); } }} />
                  </div>
                  <div className="h-56">
                    <Bar data={makeBarDataset('httpErrors','Errors','rgba(239,68,68,0.7)','max')}
                      options={{ responsive:true, maintainAspectRatio:false, plugins:{ legend:{display:false} }, scales:{ y:{ beginAtZero:true, ticks:{ precision:0 } } },
                        onClick: (evt, elements)=>{ if (!elements?.length) return; const el=elements[0]; const d=el.dataset; const idx=el.index; openBucketDetails('HTTP Errors', d.bucketStartTs[idx], d.bucketMs, ['httpErrors']); } }} />
                  </div>
                  <div className="h-56">
                    <Bar data={makeBarDataset('httpAvgRt','Avg RT','rgba(139,92,246,0.7)','avg')}
                      options={{ responsive:true, maintainAspectRatio:false, plugins:{ legend:{display:false} }, scales:{ y:{ beginAtZero:true } },
                        onClick: (evt, elements)=>{ if (!elements?.length) return; const el=elements[0]; const d=el.dataset; const idx=el.index; openBucketDetails('HTTP Avg RT', d.bucketStartTs[idx], d.bucketMs, ['httpAvgRt']); } }} />
                  </div>
                </div>
              </div>
            </div>

            {/* Top routes tables retained */}
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
              <div className="bg-white rounded-lg shadow p-6">
                <h3 className="text-lg font-semibold text-gray-900 mb-2">Top Routes (by Requests)</h3>
                {metrics.http?.routes && metrics.http.routes.size > 0 ? (
                  <div className="h-64">
                    <Bar
                      data={() => {
                        const entries = Array.from(metrics.http.routes.entries())
                          .sort((a,b)=>b[1].requests - a[1].requests)
                          .slice(0,10);
                        return {
                          labels: entries.map(([route]) => route),
                          datasets: [{ label: 'Requests', data: entries.map(([,s]) => s.requests), backgroundColor: 'rgba(14,165,233,0.7)' }]
                        };
                      }}
                      options={{ responsive:true, maintainAspectRatio:false, plugins:{ legend:{ display:false } }, scales:{ x:{ ticks:{ autoSkip:false, maxRotation:40 } }, y:{ beginAtZero:true, ticks:{ precision:0 } } } }}
                    />
                  </div>
                ) : (<p className="text-sm text-gray-500">No route data</p>)}
              </div>
              <div className="bg-white rounded-lg shadow p-6">
                <h3 className="text-lg font-semibold text-gray-900 mb-2">Top Error Routes</h3>
                {metrics.http?.routes && metrics.http.routes.size > 0 ? (
                  <div className="h-64">
                    <Bar
                      data={() => {
                        const entries = Array.from(metrics.http.routes.entries())
                          .sort((a,b)=>b[1].errors - a[1].errors)
                          .slice(0,10);
                        return {
                          labels: entries.map(([route]) => route),
                          datasets: [{ label: 'Errors', data: entries.map(([,s]) => s.errors), backgroundColor: 'rgba(239,68,68,0.7)' }]
                        };
                      }}
                      options={{ responsive:true, maintainAspectRatio:false, plugins:{ legend:{ display:false } }, scales:{ x:{ ticks:{ autoSkip:false, maxRotation:40 } }, y:{ beginAtZero:true, ticks:{ precision:0 } } } }}
                    />
                  </div>
                ) : (<p className="text-sm text-gray-500">No route data</p>)}
              </div>
            </div>
          </div>
        )}

        {/* WebSocket Tab */}
        {activeTab === 'websocket' && (
          <div className="space-y-6">
            {/* Overview Cards */}
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
              <div className="websocket-card bg-gradient-to-r from-blue-500 to-blue-600 rounded-lg shadow p-6 text-white transition-all duration-300">
                <div className="flex items-center justify-between">
                  <div>
                    <p className="text-blue-100 text-sm flex items-center">
                      Active Connections
                      {websocketStreaming && (
                        <span className="ml-2 w-2 h-2 bg-green-300 rounded-full animate-pulse"></span>
                      )}
                    </p>
                    <p className="text-3xl font-bold">{metrics.websocket?.connections?.active || 0}</p>
                    <p className="text-blue-100 text-xs mt-1">Peak: {metrics.websocket?.connections?.peak || 0}</p>
                  </div>
                  <div className="bg-blue-400 rounded-full p-3">
                    <svg className="w-6 h-6" fill="currentColor" viewBox="0 0 20 20">
                      <path d="M2 11a1 1 0 011-1h2a1 1 0 011 1v5a1 1 0 01-1 1H3a1 1 0 01-1-1v-5zM8 7a1 1 0 011-1h2a1 1 0 011 1v9a1 1 0 01-1 1H9a1 1 0 01-1-1V7zM14 4a1 1 0 011-1h2a1 1 0 011 1v12a1 1 0 01-1 1h-2a1 1 0 01-1-1V4z"/>
                    </svg>
                  </div>
                </div>
              </div>

              <div className="websocket-card bg-gradient-to-r from-green-500 to-green-600 rounded-lg shadow p-6 text-white transition-all duration-300">
                <div className="flex items-center justify-between">
                  <div>
                    <p className="text-green-100 text-sm flex items-center">
                      Total Messages
                      {websocketStreaming && (
                        <span className="ml-2 w-2 h-2 bg-green-300 rounded-full animate-pulse"></span>
                      )}
                    </p>
                    <p className="text-3xl font-bold">{(metrics.websocket?.messages?.sent || 0) + (metrics.websocket?.messages?.received || 0)}</p>
                    <p className="text-green-100 text-xs mt-1">Avg Size: {metrics.websocket?.messages?.avgSize || 0}B</p>
                  </div>
                  <div className="bg-green-400 rounded-full p-3">
                    <svg className="w-6 h-6" fill="currentColor" viewBox="0 0 20 20">
                      <path fillRule="evenodd" d="M18 10c0 3.866-3.582 7-8 7a8.841 8.841 0 01-4.083-.98L2 17l1.338-3.123C2.493 12.767 2 11.434 2 10c0-3.866 3.582-7 8-7s8 3.134 8 7zM7 9H5v2h2V9zm8 0h-2v2h2V9zM9 9h2v2H9V9z" clipRule="evenodd"/>
                    </svg>
                  </div>
                </div>
              </div>

              <div className="websocket-card bg-gradient-to-r from-purple-500 to-purple-600 rounded-lg shadow p-6 text-white transition-all duration-300">
                <div className="flex items-center justify-between">
                  <div>
                    <p className="text-purple-100 text-sm flex items-center">
                      Total Sessions
                      {websocketStreaming && (
                        <span className="ml-2 w-2 h-2 bg-green-300 rounded-full animate-pulse"></span>
                      )}
                    </p>
                    <p className="text-3xl font-bold">{metrics.websocket?.connections?.totalSessions || 0}</p>
                    <p className="text-purple-100 text-xs mt-1">Avg Time: {Math.round((metrics.websocket?.performance?.avgConnectionTime || 0) / 1000)}s</p>
                  </div>
                  <div className="bg-purple-400 rounded-full p-3">
                    <svg className="w-6 h-6" fill="currentColor" viewBox="0 0 20 20">
                      <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zm1-12a1 1 0 10-2 0v4a1 1 0 00.293.707l2.828 2.829a1 1 0 101.415-1.415L11 9.586V6z" clipRule="evenodd"/>
                    </svg>
                  </div>
                </div>
              </div>

              <div className="websocket-card bg-gradient-to-r from-red-500 to-red-600 rounded-lg shadow p-6 text-white transition-all duration-300">
                <div className="flex items-center justify-between">
                  <div>
                    <p className="text-red-100 text-sm flex items-center">
                      Message Errors
                      {websocketStreaming && (
                        <span className="ml-2 w-2 h-2 bg-green-300 rounded-full animate-pulse"></span>
                      )}
                    </p>
                    <p className="text-3xl font-bold">{metrics.websocket?.messages?.errors || 0}</p>
                    <p className="text-red-100 text-xs mt-1">Error Rate: {((metrics.websocket?.messages?.errors || 0) / Math.max(1, (metrics.websocket?.messages?.sent || 0) + (metrics.websocket?.messages?.received || 0)) * 100).toFixed(2)}%</p>
                  </div>
                  <div className="bg-red-400 rounded-full p-3">
                    <svg className="w-6 h-6" fill="currentColor" viewBox="0 0 20 20">
                      <path fillRule="evenodd" d="M18 10a8 8 0 11-16 0 8 8 0 0116 0zm-7 4a1 1 0 11-2 0 1 1 0 012 0zm-1-9a1 1 0 00-1 1v4a1 1 0 102 0V6a1 1 0 00-1-1z" clipRule="evenodd"/>
                    </svg>
                  </div>
                </div>
              </div>
            </div>

            {/* Charts Row */}
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
              {/* Connection History Chart */}
              <div className="bg-white rounded-lg shadow p-6">
                <h3 className="text-lg font-semibold text-gray-900 mb-4">Connection Activity (Last 2 Hours)</h3>
                <div className="h-64">
                  {metrics.websocket?.history?.connections?.length > 0 && (
                    <Line
                      data={{
                        labels: metrics.websocket.history.connections
                          .filter(conn => conn.type === 'connect' || conn.type === 'disconnect')
                          .slice(-50)
                          .map(conn => new Date(conn.timestamp).toLocaleTimeString()),
                        datasets: [{
                          label: 'Active Connections',
                          data: metrics.websocket.history.connections
                            .filter(conn => conn.type === 'connect' || conn.type === 'disconnect')
                            .slice(-50)
                            .map(conn => conn.active),
                          borderColor: getThemeColor('colors.primary.500', '#3b82f6'),
                          backgroundColor: getThemeColor('colors.primary.50', 'rgba(59, 130, 246, 0.1)'),
                          tension: 0.1,
                          fill: true
                        }]
                      }}
                      options={{
                        responsive: true,
                        maintainAspectRatio: false,
                        plugins: {
                          legend: { display: false }
                        },
                        scales: {
                          y: {
                            beginAtZero: true,
                            title: { display: true, text: 'Connections' }
                          },
                          x: {
                            title: { display: true, text: 'Time' }
                          }
                        }
                      }}
                    />
                  )}
                  {(!metrics.websocket?.history?.connections?.length) && (
                    <div className="flex items-center justify-center h-full text-gray-500">
                      No connection history data available
                    </div>
                  )}
                </div>
              </div>

              {/* Message Activity Chart */}
              <div className="bg-white rounded-lg shadow p-6">
                <h3 className="text-lg font-semibold text-gray-900 mb-4">Message Activity (Last 2 Hours)</h3>
                <div className="h-64">
                  {metrics.websocket?.history?.messages?.length > 0 && (
                    <Line
                      data={{
                        labels: metrics.websocket.history.messages
                          .slice(-100)
                          .reduce((acc, msg, index) => {
                            if (index % 5 === 0) acc.push(new Date(msg.timestamp).toLocaleTimeString());
                            return acc;
                          }, []),
                        datasets: [
                          {
                            label: 'Messages/5min',
                            data: metrics.websocket.history.messages
                              .slice(-100)
                              .reduce((acc, msg, index) => {
                                const groupIndex = Math.floor(index / 5);
                                if (!acc[groupIndex]) acc[groupIndex] = 0;
                                acc[groupIndex]++;
                                return acc;
                              }, []),
                            borderColor: 'rgb(16, 185, 129)',
                            backgroundColor: 'rgba(16, 185, 129, 0.1)',
                            tension: 0.1,
                            fill: true
                          }
                        ]
                      }}
                      options={{
                        responsive: true,
                        maintainAspectRatio: false,
                        plugins: {
                          legend: { display: false }
                        },
                        scales: {
                          y: {
                            beginAtZero: true,
                            title: { display: true, text: 'Messages' }
                          },
                          x: {
                            title: { display: true, text: 'Time' }
                          }
                        }
                      }}
                    />
                  )}
                  {(!metrics.websocket?.history?.messages?.length) && (
                    <div className="flex items-center justify-center h-full text-gray-500">
                      No message history data available
                    </div>
                  )}
                </div>
              </div>
            </div>

            {/* Detailed Information Row */}
            <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
              {/* Active Clients */}
              <div className="bg-white rounded-lg shadow p-6">
                <h3 className="text-lg font-semibold text-gray-900 mb-4 flex items-center">
                  Active Clients
                  <span className="ml-2 bg-blue-100 text-blue-800 text-xs font-medium px-2.5 py-0.5 rounded-full">
                    {metrics.websocket?.connections?.active || 0}
                  </span>
                </h3>
                <div className="space-y-3 max-h-96 overflow-y-auto scrollbar-thin scrollbar-thumb-gray-300 hover:scrollbar-thumb-gray-400">
                  {metrics.websocket?.clients && metrics.websocket.clients.length > 0 ? (
                    metrics.websocket.clients.map(([clientId, client]) => (
                      <div key={clientId} className="border rounded-lg p-3 bg-gray-50">
                        <div className="flex items-center justify-between mb-2">
                          <div className="text-sm font-medium text-gray-900">
                            {String(clientId).substring(0, 8)}...
                          </div>
                          <div className="flex items-center space-x-1">
                            <div className="w-2 h-2 bg-green-500 rounded-full"></div>
                            <span className="text-xs text-green-600">Connected</span>
                          </div>
                        </div>
                        <div className="space-y-1 text-xs text-gray-600">
                          <div className="flex justify-between">
                            <span>IP:</span>
                            <span className="font-mono">{client.ip}</span>
                          </div>
                          <div className="flex justify-between">
                            <span>Connected:</span>
                            <span>{formatUptime(Date.now() - client.connectedAt)}</span>
                          </div>
                          <div className="flex justify-between">
                            <span>Messages:</span>
                            <span>↑{client.messagesSent} ↓{client.messagesReceived}</span>
                          </div>
                          <div className="flex justify-between">
                            <span>Data:</span>
                            <span>↑{formatBytes(client.totalDataSent || 0)} ↓{formatBytes(client.totalDataReceived || 0)}</span>
                          </div>
                          {client.errors > 0 && (
                            <div className="flex justify-between text-red-600">
                              <span>Errors:</span>
                              <span>{client.errors}</span>
                            </div>
                          )}
                        </div>
                        {client.userAgent && (
                          <div className="mt-2 pt-2 border-t text-xs text-gray-500 truncate">
                            {client.userAgent}
                          </div>
                        )}
                      </div>
                    ))
                  ) : (
                    <div className="text-center py-8 text-gray-500">
                      <svg className="w-12 h-12 mx-auto mb-4 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8.111 16.404a5.5 5.5 0 017.778 0M12 20h.01m-7.08-7.071c3.904-3.905 10.236-3.905 14.141 0M1.394 9.393c5.857-5.857 15.355-5.857 21.213 0"/>
                      </svg>
                      <p>No active WebSocket clients</p>
                    </div>
                  )}
                </div>
              </div>

              {/* Event Types */}
              <div className="bg-white rounded-lg shadow p-6">
                <h3 className="text-lg font-semibold text-gray-900 mb-4">Message Events</h3>
                <div className="space-y-2 max-h-96 overflow-y-auto scrollbar-thin scrollbar-thumb-gray-300 hover:scrollbar-thumb-gray-400">
                  {metrics.websocket?.messages?.events && metrics.websocket.messages.events.length > 0 ? (
                    metrics.websocket.messages.events
                      .sort(([,a], [,b]) => b - a)
                      .map(([eventName, count]) => (
                        <div key={eventName} className="flex items-center justify-between p-3 bg-gray-50 rounded-lg">
                          <div className="flex items-center space-x-3">
                            <div className="w-3 h-3 bg-blue-500 rounded-full"></div>
                            <span className="text-sm font-medium text-gray-900">{eventName}</span>
                          </div>
                          <span className="text-sm font-bold text-blue-600">{count}</span>
                        </div>
                      ))
                  ) : (
                    <div className="text-center py-8 text-gray-500">
                      <svg className="w-12 h-12 mx-auto mb-4 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 12h.01M12 12h.01M16 12h.01M21 12c0 4.418-4.03 8-9 8a9.863 9.863 0 01-4.255-.949L3 20l1.395-3.72C3.512 15.042 3 13.574 3 12c0-4.418 4.03-8 9-8s9 3.582 9 8z"/>
                      </svg>
                      <p>No message events tracked</p>
                    </div>
                  )}
                </div>
              </div>

              {/* Performance & Errors */}
              <div className="bg-white rounded-lg shadow p-6">
                <h3 className="text-lg font-semibold text-gray-900 mb-4">Performance & Diagnostics</h3>
                
                {/* Disconnect Reasons */}
                <div className="mb-6">
                  <h4 className="text-sm font-semibold text-gray-700 mb-3">Disconnect Reasons</h4>
                  <div className="space-y-2">
                    {metrics.websocket?.performance?.disconnectReasons && metrics.websocket.performance.disconnectReasons.length > 0 ? (
                      metrics.websocket.performance.disconnectReasons
                        .sort(([,a], [,b]) => b - a)
                        .map(([reason, count]) => (
                          <div key={reason} className="flex items-center justify-between text-sm">
                            <span className="text-gray-600">{reason}</span>
                            <span className="font-medium text-gray-900">{count}</span>
                          </div>
                        ))
                    ) : (
                      <p className="text-xs text-gray-500">No disconnections tracked</p>
                    )}
                  </div>
                </div>

                {/* Error Types */}
                <div className="mb-6">
                  <h4 className="text-sm font-semibold text-gray-700 mb-3">Error Types</h4>
                  <div className="space-y-2">
                    {metrics.websocket?.performance?.errorTypes && metrics.websocket.performance.errorTypes.length > 0 ? (
                      metrics.websocket.performance.errorTypes
                        .sort(([,a], [,b]) => b - a)
                        .map(([errorType, count]) => (
                          <div key={errorType} className="flex items-center justify-between text-sm">
                            <span className="text-red-600">{errorType}</span>
                            <span className="font-medium text-red-700">{count}</span>
                          </div>
                        ))
                    ) : (
                      <p className="text-xs text-gray-500">No errors tracked</p>
                    )}
                  </div>
                </div>

                {/* Performance Stats */}
                <div>
                  <h4 className="text-sm font-semibold text-gray-700 mb-3">Performance Stats</h4>
                  <div className="space-y-2 text-sm">
                    <div className="flex justify-between">
                      <span className="text-gray-600">Avg Connection Time</span>
                      <span className="font-medium">{Math.round((metrics.websocket?.performance?.avgConnectionTime || 0) / 1000)}s</span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-gray-600">Avg Message Size</span>
                      <span className="font-medium">{formatBytes(metrics.websocket?.messages?.avgSize || 0)}</span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-gray-600">Total Data Transfer</span>
                      <span className="font-medium">{formatBytes((metrics.websocket?.messages?.totalSize || 0))}</span>
                    </div>
                  </div>
                </div>
              </div>
            </div>

            {/* Network Performance Metrics */}
            <div className="bg-white rounded-lg shadow p-6 mb-6">
              <h3 className="text-lg font-semibold text-gray-900 mb-4">Network Performance</h3>
              <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                <div className="text-center">
                  <p className="text-2xl font-bold text-blue-600">{formatBytes(metrics.websocket?.messages?.totalSize || 0)}</p>
                  <p className="text-sm text-gray-600">Total Data Transfer</p>
                </div>
                <div className="text-center">
                  <p className="text-2xl font-bold text-green-600">{formatBytes(metrics.websocket?.messages?.avgSize || 0)}</p>
                  <p className="text-sm text-gray-600">Avg Message Size</p>
                </div>
                <div className="text-center">
                  <p className="text-2xl font-bold text-purple-600">
                    {metrics.websocket?.connections?.totalSessions ? 
                      Math.round((metrics.websocket?.messages?.totalSize || 0) / metrics.websocket.connections.totalSessions) : 0}
                  </p>
                  <p className="text-sm text-gray-600">Bytes/Session</p>
                </div>
                <div className="text-center">
                  <p className="text-2xl font-bold text-orange-600">
                    {Math.round((metrics.websocket?.performance?.avgConnectionTime || 0) / 1000)}s
                  </p>
                  <p className="text-sm text-gray-600">Avg Session Duration</p>
                </div>
              </div>
            </div>

            {/* Message Event Statistics */}
            <div className="bg-white rounded-lg shadow p-6 mb-6">
              <h3 className="text-lg font-semibold text-gray-900 mb-4">Message Events Breakdown</h3>
              <div className="space-y-3">
                {metrics.websocket?.messages?.events && metrics.websocket.messages.events.length > 0 ? (
                  metrics.websocket.messages.events
                    .sort(([,a], [,b]) => b - a)
                    .map(([eventName, count]) => {
                      const totalMessages = (metrics.websocket?.messages?.sent || 0) + (metrics.websocket?.messages?.received || 0);
                      const percentage = totalMessages > 0 ? ((count / totalMessages) * 100).toFixed(1) : 0;
                      return (
                        <div key={eventName} className="flex items-center justify-between p-3 bg-gray-50 rounded-lg">
                          <div className="flex items-center space-x-3">
                            <div className="w-3 h-3 bg-blue-500 rounded-full"></div>
                            <span className="text-sm font-medium text-gray-900">{eventName}</span>
                          </div>
                          <div className="flex items-center space-x-4">
                            <span className="text-sm text-gray-600">{percentage}%</span>
                            <span className="text-sm font-semibold text-gray-900">{count}</span>
                            <div className="w-20 bg-gray-200 rounded-full h-2">
                              <div 
                                className="bg-blue-500 h-2 rounded-full" 
                                style={{width: `${Math.min(100, percentage)}%`}}
                              ></div>
                            </div>
                          </div>
                        </div>
                      );
                    })
                ) : (
                  <div className="text-center py-4 text-gray-500">
                    <p>No message events recorded</p>
                  </div>
                )}
              </div>
            </div>

            {/* Detailed Client Statistics */}
            <div className="bg-white rounded-lg shadow p-6 mb-6">
              <h3 className="text-lg font-semibold text-gray-900 mb-4 flex items-center justify-between">
                Client Details
                <span className="text-sm bg-blue-100 text-blue-800 px-2 py-1 rounded-full">
                  {metrics.websocket?.clients?.length || 0} connected
                </span>
              </h3>
              <div className="space-y-3 max-h-80 overflow-y-auto">
                {metrics.websocket?.clients && metrics.websocket.clients.length > 0 ? (
                  metrics.websocket.clients.map(([clientId, client]) => {
                    const sessionDuration = Date.now() - client.connectedAt;
                    const dataRate = sessionDuration > 0 ? (client.totalDataSent / (sessionDuration / 1000)).toFixed(1) : 0;
                    return (
                      <div key={clientId} className="border rounded-lg p-4 bg-gray-50">
                        <div className="flex items-center justify-between mb-3">
                          <div className="text-sm font-medium text-gray-900 font-mono">
                            {String(clientId).substring(0, 12)}...
                          </div>
                          <div className="flex items-center space-x-2">
                            <div className="w-2 h-2 bg-green-500 rounded-full animate-pulse"></div>
                            <span className="text-xs text-green-600 font-medium">ACTIVE</span>
                          </div>
                        </div>
                        
                        <div className="grid grid-cols-2 md:grid-cols-4 gap-3 text-xs">
                          <div>
                            <p className="text-gray-600">IP Address</p>
                            <p className="font-mono text-gray-900">{client.ip}</p>
                          </div>
                          <div>
                            <p className="text-gray-600">Connected</p>
                            <p className="font-medium text-gray-900">
                              {Math.round(sessionDuration / 1000)}s ago
                            </p>
                          </div>
                          <div>
                            <p className="text-gray-600">Messages</p>
                            <p className="font-medium text-gray-900">
                              ↑{client.messagesSent} ↓{client.messagesReceived}
                            </p>
                          </div>
                          <div>
                            <p className="text-gray-600">Data Transfer</p>
                            <p className="font-medium text-gray-900">
                              {formatBytes(client.totalDataSent + client.totalDataReceived)}
                            </p>
                          </div>
                        </div>
                        
                        <div className="mt-3 grid grid-cols-2 md:grid-cols-3 gap-3 text-xs">
                          <div>
                            <p className="text-gray-600">Data Rate</p>
                            <p className="font-medium text-blue-600">{dataRate} B/s</p>
                          </div>
                          <div>
                            <p className="text-gray-600">Last Activity</p>
                            <p className="font-medium text-gray-900">
                              {Math.round((Date.now() - client.lastActivity) / 1000)}s
                            </p>
                          </div>
                          <div>
                            <p className="text-gray-600">Events</p>
                            <p className="font-medium text-gray-900">
                              {client.events ? client.events.length : 0} types
                            </p>
                          </div>
                        </div>
                        
                        {client.events && client.events.length > 0 && (
                          <div className="mt-3 pt-3 border-t border-gray-200">
                            <p className="text-xs text-gray-600 mb-2">Event Distribution:</p>
                            <div className="flex flex-wrap gap-1">
                              {client.events.map(([eventType, eventCount]) => (
                                <span key={eventType} className="inline-flex items-center px-2 py-1 rounded-full text-xs bg-blue-100 text-blue-800">
                                  {eventType}: {eventCount}
                                </span>
                              ))}
                            </div>
                          </div>
                        )}
                        
                        <div className="mt-3 pt-3 border-t border-gray-200">
                          <p className="text-xs text-gray-600 mb-1">User Agent:</p>
                          <p className="text-xs text-gray-800 font-mono truncate" title={client.userAgent}>
                            {client.userAgent}
                          </p>
                        </div>
                      </div>
                    );
                  })
                ) : (
                  <div className="text-center py-8 text-gray-500">
                    <svg className="w-12 h-12 mx-auto mb-4 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8.111 16.404a5.5 5.5 0 017.778 0M12 20h.01m-7.08-7.071c3.904-3.905 10.236-3.905 14.141 0M1.394 9.393c5.857-5.857 15.355-5.857 21.213 0"/>
                    </svg>
                    <p>No active WebSocket clients</p>
                  </div>
                )}
              </div>
            </div>

            {/* Connection History and Analytics */}
            <div className="bg-white rounded-lg shadow p-6 mb-6">
              <h3 className="text-lg font-semibold text-gray-900 mb-4">Connection Analytics</h3>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                <div>
                  <h4 className="text-sm font-semibold text-gray-700 mb-3">Connection Statistics</h4>
                  <div className="space-y-2 text-sm">
                    <div className="flex justify-between">
                      <span className="text-gray-600">Total Connections</span>
                      <span className="font-medium">{metrics.websocket?.connections?.total || 0}</span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-gray-600">Currently Active</span>
                      <span className="font-medium text-green-600">{metrics.websocket?.connections?.active || 0}</span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-gray-600">Peak Concurrent</span>
                      <span className="font-medium text-blue-600">{metrics.websocket?.connections?.peak || 0}</span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-gray-600">Total Sessions</span>
                      <span className="font-medium">{metrics.websocket?.connections?.totalSessions || 0}</span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-gray-600">Disconnect Rate</span>
                      <span className="font-medium">
                        {metrics.websocket?.connections?.totalSessions > 0 ? 
                          (((metrics.websocket.connections.totalSessions - metrics.websocket.connections.active) / metrics.websocket.connections.totalSessions * 100).toFixed(1)) : 0}%
                      </span>
                    </div>
                  </div>
                </div>
                <div>
                  <h4 className="text-sm font-semibold text-gray-700 mb-3">Message Statistics</h4>
                  <div className="space-y-2 text-sm">
                    <div className="flex justify-between">
                      <span className="text-gray-600">Messages Sent</span>
                      <span className="font-medium text-blue-600">{metrics.websocket?.messages?.sent || 0}</span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-gray-600">Messages Received</span>
                      <span className="font-medium text-green-600">{metrics.websocket?.messages?.received || 0}</span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-gray-600">Message Errors</span>
                      <span className="font-medium text-red-600">{metrics.websocket?.messages?.errors || 0}</span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-gray-600">Success Rate</span>
                      <span className="font-medium text-green-600">
                        {((metrics.websocket?.messages?.sent || 0) + (metrics.websocket?.messages?.received || 0)) > 0 ? 
                          (((metrics.websocket?.messages?.sent || 0) + (metrics.websocket?.messages?.received || 0) - (metrics.websocket?.messages?.errors || 0)) / 
                           ((metrics.websocket?.messages?.sent || 0) + (metrics.websocket?.messages?.received || 0)) * 100).toFixed(1) : 100}%
                      </span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-gray-600">Avg Message Rate</span>
                      <span className="font-medium">
                        {metrics.websocket?.connections?.active > 0 ? 
                          (((metrics.websocket?.messages?.sent || 0) + (metrics.websocket?.messages?.received || 0)) / metrics.websocket.connections.active).toFixed(1) : 0}/client
                      </span>
                    </div>
                  </div>
                </div>
              </div>
            </div>

            {/* Disconnect Reasons and Error Analysis */}
            {(metrics.websocket?.performance?.disconnectReasons?.length > 0 || metrics.websocket?.performance?.errorTypes?.length > 0) && (
              <div className="bg-white rounded-lg shadow p-6 mb-6">
                <h3 className="text-lg font-semibold text-gray-900 mb-4">Error Analysis</h3>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                  {metrics.websocket?.performance?.disconnectReasons?.length > 0 && (
                    <div>
                      <h4 className="text-sm font-semibold text-gray-700 mb-3">Disconnect Reasons</h4>
                      <div className="space-y-2">
                        {metrics.websocket.performance.disconnectReasons
                          .sort(([,a], [,b]) => b - a)
                          .map(([reason, count]) => (
                            <div key={reason} className="flex items-center justify-between text-sm p-2 bg-red-50 rounded">
                              <span className="text-gray-700">{reason}</span>
                              <span className="font-semibold text-red-600">{count}</span>
                            </div>
                          ))}
                      </div>
                    </div>
                  )}
                  {metrics.websocket?.performance?.errorTypes?.length > 0 && (
                    <div>
                      <h4 className="text-sm font-semibold text-gray-700 mb-3">Error Types</h4>
                      <div className="space-y-2">
                        {metrics.websocket.performance.errorTypes
                          .sort(([,a], [,b]) => b - a)
                          .map(([errorType, count]) => (
                            <div key={errorType} className="flex items-center justify-between text-sm p-2 bg-orange-50 rounded">
                              <span className="text-gray-700">{errorType}</span>
                              <span className="font-semibold text-orange-600">{count}</span>
                            </div>
                          ))}
                      </div>
                    </div>
                  )}
                </div>
              </div>
            )}

            {/* Recent Activity Log */}
            <div className="bg-white rounded-lg shadow p-6">
              <h3 className="text-lg font-semibold text-gray-900 mb-4 flex items-center justify-between">
                Recent WebSocket Activity
                <button 
                  onClick={() => setWebsocketStreaming(!websocketStreaming)}
                  className={`px-3 py-1 rounded-full text-xs font-medium transition-all ${
                    websocketStreaming 
                      ? 'bg-green-100 text-green-800 hover:bg-green-200' 
                      : 'bg-gray-100 text-gray-800 hover:bg-gray-200'
                  }`}
                >
                  {websocketStreaming ? '🟢 Live' : '⏸️ Paused'}
                </button>
              </h3>
              <div className="max-h-64 overflow-y-auto scrollbar-thin scrollbar-thumb-gray-300 hover:scrollbar-thumb-gray-400">
                <div className="space-y-2">
                  {logs
                    .filter(log => log.event.includes('WEBSOCKET'))
                    .slice(0, 20)
                    .map((log, index) => {
                      const isError = log.level === 'ERROR';
                      const isWarning = log.level === 'WARN';
                      const isConnection = log.event.includes('CONNECT') || log.event.includes('DISCONNECT');
                      
                      return (
                        <div 
                          key={index}
                          className={`p-3 rounded-lg text-sm ${
                            isError ? 'bg-red-50 border-l-4 border-red-400' :
                            isWarning ? 'bg-yellow-50 border-l-4 border-yellow-400' :
                            isConnection ? 'bg-blue-50 border-l-4 border-blue-400' :
                            'bg-gray-50 border-l-4 border-gray-400'
                          }`}
                        >
                          <div className="flex items-center justify-between mb-1">
                            <span className={`font-medium ${
                              isError ? 'text-red-800' :
                              isWarning ? 'text-yellow-800' :
                              isConnection ? 'text-blue-800' :
                              'text-gray-800'
                            }`}>
                              {log.event.replace('WEBSOCKET_', '')}
                            </span>
                            <span className="text-xs text-gray-500">
                              {new Date(log.timestamp).toLocaleTimeString()}
                            </span>
                          </div>
                          {log.data && (
                            <div className="text-xs text-gray-600 font-mono">
                              {Object.entries(log.data).map(([key, value]) => (
                                <span key={key} className="mr-3">
                                  {key}: {typeof value === 'object' ? JSON.stringify(value) : value}
                                </span>
                              ))}
                            </div>
                          )}
                        </div>
                      );
                    })}
                  {logs.filter(log => log.event.includes('WEBSOCKET')).length === 0 && (
                    <div className="text-center py-8 text-gray-500">
                      <p>No WebSocket activity logged yet</p>
                    </div>
                  )}
                </div>
              </div>
            </div>
          </div>
        )}

        {/* Database Tab */}
        {activeTab === 'database' && (
          <div className="space-y-6">
            <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
              {/* KPIs */}
              <div className="bg-white rounded-lg shadow p-6">
                <h3 className="text-lg font-semibold text-gray-900 mb-2">KPIs (last 10m)</h3>
                <div className="grid grid-cols-3 gap-4 text-center">
                  <div>
                    <div className="text-xs text-gray-500">Active</div>
                    <div className="text-2xl font-semibold text-green-600">{metrics.database?.queries?.active || 0}</div>
                  </div>
                  <div>
                    <div className="text-xs text-gray-500">Errors</div>
                    <div className="text-2xl font-semibold text-red-600">{metrics.database?.queries?.errors || 0}</div>
                  </div>
                  <div>
                    <div className="text-xs text-gray-500">Avg Time</div>
                    <div className="text-2xl font-semibold text-indigo-600">{Math.round(metrics.database?.queries?.avgTime || 0)}ms</div>
                  </div>
                </div>
              </div>
              {/* Bars */}
              <div className="bg-white rounded-lg shadow p-6 lg:col-span-2">
                <h3 className="text-lg font-semibold text-gray-900 mb-2">Last 10 minutes</h3>
                <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                  <div className="h-56">
                    <Bar data={makeBarDataset('dbActive','Active','rgba(34,197,94,0.7)','max')}
                      options={{ responsive:true, maintainAspectRatio:false, plugins:{ legend:{display:false} }, scales:{ y:{ beginAtZero:true, ticks:{ precision:0 } } },
                        onClick: (evt, elements)=>{ if (!elements?.length) return; const el=elements[0]; const d=el.dataset; const idx=el.index; openBucketDetails('DB Active', d.bucketStartTs[idx], d.bucketMs, ['dbActive']); } }} />
                  </div>
                  <div className="h-56">
                    <Bar data={makeBarDataset('dbErrors','Errors','rgba(239,68,68,0.7)','max')}
                      options={{ responsive:true, maintainAspectRatio:false, plugins:{ legend:{display:false} }, scales:{ y:{ beginAtZero:true, ticks:{ precision:0 } } },
                        onClick: (evt, elements)=>{ if (!elements?.length) return; const el=elements[0]; const d=el.dataset; const idx=el.index; openBucketDetails('DB Errors', d.bucketStartTs[idx], d.bucketMs, ['dbErrors']); } }} />
                  </div>
                  <div className="h-56">
                    <Bar data={makeBarDataset('dbAvg','Avg','rgba(99,102,241,0.7)','avg')}
                      options={{ responsive:true, maintainAspectRatio:false, plugins:{ legend:{display:false} }, scales:{ y:{ beginAtZero:true } },
                        onClick: (evt, elements)=>{ if (!elements?.length) return; const el=elements[0]; const d=el.dataset; const idx=el.index; openBucketDetails('DB Avg', d.bucketStartTs[idx], d.bucketMs, ['dbAvg']); } }} />
                  </div>
                </div>
              </div>
            </div>

            <div className="bg-white rounded-lg shadow p-6">
              <h3 className="text-lg font-semibold text-gray-900 mb-4">Active Queries</h3>
              <div className="space-y-2 max-h-64 overflow-y-auto">
                {metrics.activeQueries?.length > 0 ? (
                  metrics.activeQueries.map((query, index) => (
                    <div key={index} className="border rounded p-3">
                      <div className="text-sm font-mono truncate">{query.query}</div>
                      <div className="text-xs text-gray-500">Type: {query.type} | Duration: {Date.now() - query.startTime}ms</div>
                    </div>
                  ))
                ) : (
                  <p className="text-gray-500 text-sm">No active queries</p>
                )}
              </div>
            </div>
          </div>
        )}

        {/* AI Tab */}
        {activeTab === 'ai' && (
          <AIConfigurationTab metrics={metrics} />
        )}


        {/* Scrapping Configuration Tab */}
        {activeTab === 'scrapping' && (
          <ScrapingConfiguration />
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
                <div 
                  className="text-3xl font-bold text-red-600 cursor-pointer hover:text-red-800 hover:underline"
                  onClick={() => handleErrorClick('responses')}
                >
                  {metrics.http?.responses?.error || 0}
                </div>
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
                  {metrics.http?.routes && Object.keys(metrics.http.routes).length > 0 ? (
                    <div className="divide-y">
                      {Object.entries(metrics.http.routes).map(([route, stats]) => (
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

        {/* CSS Editor Tab */}
        {activeTab === 'csseditor' && (
          <AdvancedCSSEditor />
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

      {/* Error Details Modal */}
      {showErrorModal && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
          <div className="bg-white rounded-lg shadow-xl max-w-4xl w-full max-h-[80vh] overflow-hidden m-4">
            <div className="flex justify-between items-center p-6 border-b">
              <h2 className="text-xl font-semibold text-gray-900">HTTP Error Details</h2>
              <button
                onClick={() => setShowErrorModal(false)}
                className="text-gray-400 hover:text-gray-600 transition-colors"
              >
                <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                </svg>
              </button>
            </div>
            <div className="p-6 overflow-y-auto max-h-[60vh]">
              {selectedErrors.length === 0 ? (
                <div className="text-center py-8 text-gray-500">
                  No error details available
                </div>
              ) : (
                <div className="space-y-4">
                  {selectedErrors.map((error, index) => (
                    <div key={error.id || index} className="border rounded-lg p-4 bg-red-50 border-red-200">
                      <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-3">
                        <div>
                          <span className="text-sm font-medium text-gray-600">Time:</span>
                          <div className="text-sm text-gray-900">{formatErrorTime(error.timestamp)}</div>
                        </div>
                        <div>
                          <span className="text-sm font-medium text-gray-600">Status Code:</span>
                          <div className="text-sm font-bold text-red-600">{error.statusCode}</div>
                        </div>
                        <div>
                          <span className="text-sm font-medium text-gray-600">Method:</span>
                          <div className="text-sm text-gray-900 font-mono">{error.method}</div>
                        </div>
                        <div>
                          <span className="text-sm font-medium text-gray-600">Duration:</span>
                          <div className="text-sm text-gray-900">{error.duration}ms</div>
                        </div>
                      </div>
                      <div className="mb-3">
                        <span className="text-sm font-medium text-gray-600">URL:</span>
                        <div className="text-sm text-gray-900 font-mono break-all">{error.url}</div>
                      </div>
                      <div className="mb-3">
                        <span className="text-sm font-medium text-gray-600">IP Address:</span>
                        <div className="text-sm text-gray-900">{error.ip}</div>
                      </div>
                      {error.errorMessage && error.errorMessage !== 'No error message' && (
                        <div className="mb-3">
                          <span className="text-sm font-medium text-gray-600">Error Message:</span>
                          <div className="text-sm text-gray-900 bg-white p-2 rounded border font-mono">
                            {error.errorMessage}
                          </div>
                        </div>
                      )}
                      <div>
                        <span className="text-sm font-medium text-gray-600">User Agent:</span>
                        <div className="text-sm text-gray-700 break-all">{error.userAgent}</div>
                      </div>
                    </div>
                  ))}
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

// Modal UI (simple inline to avoid extra files)
export const BucketModal = ({ open, title, items, onClose }) => {
  if (!open) return null;
  return (
    <div className="fixed inset-0 z-[2000] bg-black/40 flex items-center justify-center">
      <div className="bg-white rounded-lg shadow-xl max-w-2xl w-full max-h-[80vh] overflow-hidden">
        <div className="flex items-center justify-between px-4 py-2 border-b">
          <div className="text-sm font-semibold text-gray-800">{title}</div>
          <button className="text-gray-500 hover:text-gray-700" onClick={onClose}>✕</button>
        </div>
        <div className="p-4 overflow-auto">
          {items && items.length ? (
            <table className="min-w-full text-sm">
              <thead>
                <tr className="border-b">
                  <th className="text-left py-1 pr-2">Time</th>
                  <th className="text-left py-1 pr-2">Series</th>
                  <th className="text-left py-1">Value</th>
                </tr>
              </thead>
              <tbody>
                {items.map((it, idx) => (
                  <tr key={idx} className="border-b last:border-0">
                    <td className="py-1 pr-2 whitespace-nowrap">{new Date(it.t).toLocaleTimeString()}</td>
                    <td className="py-1 pr-2">{it.key}</td>
                    <td className="py-1">{it.v}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          ) : (
            <div className="text-gray-500 text-sm">No data in this window</div>
          )}
        </div>
      </div>
    </div>
  );
};