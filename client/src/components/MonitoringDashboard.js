import React, { useState, useEffect, useRef } from 'react';
import io from 'socket.io-client';
import AIDashboard from './AIDashboard';
import AISettingsInline from './AISettingsInline';
import ScrapingLibrariesPanel from './ScrapingLibrariesPanel';
import { Line, Bar } from 'react-chartjs-2';
import 'chartjs-adapter-date-fns';
import {
  Chart as ChartJS,
  CategoryScale,
  LinearScale,
  PointElement,
  LineElement,
  BarElement,
  Tooltip,
  Legend,
  TimeScale
} from 'chart.js';
import zoomPlugin from 'chartjs-plugin-zoom';
ChartJS.register(CategoryScale, LinearScale, PointElement, LineElement, BarElement, Tooltip, Legend, TimeScale, zoomPlugin);

const MonitoringDashboard = ({ onClose }) => {
  const [metrics, setMetrics] = useState(null);
  const [logs, setLogs] = useState([]);
  const [isConnected, setIsConnected] = useState(false);
  const [activeTab, setActiveTab] = useState('overview');
  const socketRef = useRef(null);
  const cpuCanvasRef = useRef(null);
  const memCanvasRef = useRef(null);
  const gpuCanvasRef = useRef(null);
  const miniCpuRef = useRef(null);
  const miniMemRef = useRef(null);
  const miniGpuRef = useRef(null);
  const miniHttpRef = useRef(null);
  const miniWsRef = useRef(null);
  const miniDbRef = useRef(null);
  const miniAiRef = useRef(null);
  const miniScrapRef = useRef(null);
  // Detailed charts per tab
  const httpActiveChartRef = useRef(null);
  const httpErrorsChartRef = useRef(null);
  const httpAvgRtChartRef = useRef(null);
  const wsActiveChartRef = useRef(null);
  const wsMsgsChartRef = useRef(null);
  const dbActiveChartRef = useRef(null);
  const dbErrorsChartRef = useRef(null);
  const dbAvgChartRef = useRef(null);
  const historyRef = useRef({
    cpu: [], memory: [], gpu: [], gpuMemory: [],
    httpActive: [], httpErrors: [], httpAvgRt: [],
    wsActive: [], wsMsgsPerSec: [],
    dbActive: [], dbErrors: [], dbAvg: [],
    aiAvg: [],
    scrapyArticles: []
  });
  const prevWsCountsRef = useRef({ sent: 0, recv: 0, ts: 0 });
  const [minWindowMs, setMinWindowMs] = useState(5 * 60 * 1000); // start small, grow to 2h
  const [windowMs, setWindowMs] = useState(2 * 60 * 60 * 1000); // default 2h
  const hiddenSeriesRef = useRef(new Set());
  const [paused, setPaused] = useState(false);
  const [viewWindowMs, setViewWindowMs] = useState(10 * 60 * 1000); // default recent 10m for zoomable charts

  const makeTimeOptions = (beginAtZero = true) => {
    const now = Date.now();
    const min = now - Math.min(viewWindowMs, 2 * 60 * 60 * 1000);
    const max = now;
    return {
      responsive: true,
      maintainAspectRatio: false,
      parsing: false,
      animation: false,
      plugins: {
        legend: { display: false },
        tooltip: { mode: 'nearest', intersect: false },
        zoom: {
          zoom: {
            wheel: { enabled: true },
            pinch: { enabled: true },
            mode: 'x',
            limits: { x: { min: now - 2 * 60 * 60 * 1000, max: max } }
          },
          pan: { enabled: true, mode: 'x' }
        }
      },
      scales: {
        x: { type: 'time', min, max, time: { unit: 'minute' } },
        y: { beginAtZero, ticks: { precision: 0 } }
      }
    };
  };

  // Build Chart.js points and break lines on long gaps
  const toChartPoints = (series, gapMs = 20000) => {
    if (!Array.isArray(series) || series.length === 0) return [];
    const pts = [];
    const sorted = series.slice().sort((a, b) => a.t - b.t);
    for (let i = 0; i < sorted.length; i++) {
      const p = sorted[i];
      if (i > 0 && (p.t - sorted[i - 1].t) > gapMs) {
        pts.push({ x: sorted[i - 1].t + 1, y: null });
      }
      pts.push({ x: p.t, y: p.v });
    }
    return pts;
  };

  // Build bar datasets (bucketed over the last 10 minutes by 1 minute)
  const makeBarDataset = (seriesKey, label, color, agg = 'avg', windowMsBar = 10 * 60 * 1000, bucketMs = 60 * 1000) => {
    const now = Date.now();
    const start = now - windowMsBar;
    const buckets = Math.max(1, Math.ceil(windowMsBar / bucketMs));
    const values = new Array(buckets).fill(0);
    const counts = new Array(buckets).fill(0);
    const labels = new Array(buckets).fill('');
    for (let i = 0; i < buckets; i++) {
      const ts = start + i * bucketMs;
      const d = new Date(ts);
      labels[i] = d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
    }
    const points = (historyRef.current[seriesKey] || []).filter(p => p.t >= start && p.t <= now);
    for (const p of points) {
      const idx = Math.min(buckets - 1, Math.max(0, Math.floor((p.t - start) / bucketMs)));
      if (agg === 'max') {
        values[idx] = Math.max(values[idx], p.v || 0);
      } else {
        values[idx] += (p.v || 0);
        counts[idx] += 1;
      }
    }
    const finalValues = values.map((v, i) => (agg === 'avg' ? (counts[i] ? Math.round(v / counts[i]) : 0) : Math.round(v)));
    const dataset = {
      labels,
      datasets: [{
        label,
        data: finalValues,
        backgroundColor: color,
        bucketStartTs: labels.map((_, i) => start + i * bucketMs),
        bucketMs
      }]
    };
    return dataset;
  };

  // Safely get entries from routes which might be a Map or plain object
  const getEntries = (maybeMapOrObj) => {
    if (!maybeMapOrObj) return [];
    try {
      if (maybeMapOrObj instanceof Map) return Array.from(maybeMapOrObj.entries());
      if (typeof maybeMapOrObj === 'object') return Object.entries(maybeMapOrObj);
    } catch {}
    return [];
  };

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

    // Listen for real-time metrics updates (ensure we always have a metrics object)
    socketRef.current.on('systemMetrics', (data) => {
      setMetrics(prev => ({ ...(prev || {}), system: data }));
      // Push points into local history unless paused
      if (paused) return;
      // Bounded to ~2h at 1Hz; we still prune by MAX below
      const ts = Date.now();
      const h = historyRef.current;
      h.cpu.push({ t: ts, v: data?.cpu?.usage || 0 });
      h.memory.push({ t: ts, v: data?.memory?.percentage || 0 });
      if (data?.gpu) {
        h.gpu.push({ t: ts, v: data.gpu.usage || 0 });
        h.gpuMemory.push({ t: ts, v: data.gpu.memory?.percentage || 0 });
      }
      const MAX = 7200;
      if (h.cpu.length > MAX) h.cpu.shift();
      if (h.memory.length > MAX) h.memory.shift();
      if (h.gpu.length > MAX) h.gpu.shift();
      if (h.gpuMemory.length > MAX) h.gpuMemory.shift();
      // Redraw
      requestAnimationFrame(() => { drawAllCharts(); drawOverviewCharts(); });
    });

    socketRef.current.on('httpMetrics', (data) => {
      setMetrics(prev => ({ ...(prev || {}), http: data }));
      const ts = Date.now();
      historyRef.current.httpActive.push({ t: ts, v: data?.requests?.active || 0 });
      historyRef.current.httpErrors.push({ t: ts, v: data?.requests?.errors || 0 });
      historyRef.current.httpAvgRt.push({ t: ts, v: Math.round(data?.requests?.avgResponseTime || 0) });
      if (historyRef.current.httpActive.length > 7200) historyRef.current.httpActive.shift();
      if (historyRef.current.httpErrors.length > 7200) historyRef.current.httpErrors.shift();
      if (historyRef.current.httpAvgRt.length > 7200) historyRef.current.httpAvgRt.shift();
      requestAnimationFrame(drawOverviewCharts);
    });

    socketRef.current.on('websocketMetrics', (data) => {
      setMetrics(prev => ({ ...(prev || {}), websocket: data }));
      try { window.dispatchEvent(new CustomEvent('ws-metrics', { detail: data })); } catch {}
      const ts = Date.now();
      historyRef.current.wsActive.push({ t: ts, v: data?.connections?.active || 0 });
      if (historyRef.current.wsActive.length > 7200) historyRef.current.wsActive.shift();
      // compute msgs/sec from counters
      const sent = data?.messages?.sent || 0;
      const recv = data?.messages?.received || 0;
      const prev = prevWsCountsRef.current;
      if (prev.ts) {
        const dt = Math.max(1, (ts - prev.ts) / 1000);
        const d = Math.max(0, (sent + recv) - (prev.sent + prev.recv));
        historyRef.current.wsMsgsPerSec.push({ t: ts, v: Math.round(d / dt) });
        if (historyRef.current.wsMsgsPerSec.length > 7200) historyRef.current.wsMsgsPerSec.shift();
      }
      prevWsCountsRef.current = { sent, recv, ts };
      requestAnimationFrame(drawOverviewCharts);
    });

    socketRef.current.on('databaseMetrics', (data) => {
      setMetrics(prev => ({ ...(prev || {}), database: data }));
      const ts = Date.now();
      historyRef.current.dbActive.push({ t: ts, v: data?.queries?.active || 0 });
      historyRef.current.dbErrors.push({ t: ts, v: data?.queries?.errors || 0 });
      historyRef.current.dbAvg.push({ t: ts, v: Math.round(data?.queries?.avgTime || 0) });
      if (historyRef.current.dbActive.length > 7200) historyRef.current.dbActive.shift();
      if (historyRef.current.dbErrors.length > 7200) historyRef.current.dbErrors.shift();
      if (historyRef.current.dbAvg.length > 7200) historyRef.current.dbAvg.shift();
      requestAnimationFrame(drawOverviewCharts);
    });

    socketRef.current.on('aiMetrics', (data) => {
      setMetrics(prev => ({ ...(prev || {}), ai: data }));
      const ts = Date.now();
      historyRef.current.aiAvg.push({ t: ts, v: Math.round(data?.avgResponseTime || 0) });
      if (historyRef.current.aiAvg.length > 7200) historyRef.current.aiAvg.shift();
      requestAnimationFrame(drawOverviewCharts);
    });

    socketRef.current.on('scrapyMetrics', (data) => {
      setMetrics(prev => ({ ...(prev || {}), scrapy: data }));
      const ts = Date.now();
      const v = data?.lastRunArticles != null ? data.lastRunArticles : 0;
      historyRef.current.scrapyArticles.push({ t: ts, v });
      if (historyRef.current.scrapyArticles.length > 7200) historyRef.current.scrapyArticles.shift();
      requestAnimationFrame(drawOverviewCharts);
    });

    // Listen for log updates
    socketRef.current.on('log', (logEntry) => {
      setLogs(prev => [logEntry, ...prev.slice(0, 99)]);
    });

    // Prefill from DB history (last 2h)
    (async () => {
      try {
        const since = Date.now() - 2 * 60 * 60 * 1000;
        const resp = await fetch(`http://localhost:8080/api/system-metrics/history?sinceMs=${since}`);
        const data = await resp.json();
        const h = historyRef.current;
        (data.samples || []).forEach(s => {
          const t = s.ts;
          h.cpu.push({ t, v: s.cpu_pct||0 });
          h.memory.push({ t, v: s.mem_pct||0 });
          h.gpu.push({ t, v: s.gpu_pct||0 });
          h.gpuMemory.push({ t, v: s.gpu_mem_pct||0 });
        });
        // Prefill other services histories
        const [httpH, dbH, aiH, wsH, scrapH] = await Promise.all([
          fetch(`http://localhost:8080/api/http-metrics/history?sinceMs=${since}`).then(r=>r.json()).catch(()=>({samples:[]})),
          fetch(`http://localhost:8080/api/db-metrics/history?sinceMs=${since}`).then(r=>r.json()).catch(()=>({samples:[]})),
          fetch(`http://localhost:8080/api/ai-metrics/history?sinceMs=${since}`).then(r=>r.json()).catch(()=>({samples:[]})),
          fetch(`http://localhost:8080/api/websocket-metrics/history?sinceMs=${since}`).then(r=>r.json()).catch(()=>({samples:[]})),
          fetch(`http://localhost:8080/api/scrapy-metrics/history?sinceMs=${since}`).then(r=>r.json()).catch(()=>({samples:[]}))
        ]);
        (httpH.samples||[]).forEach(s=> { h.httpActive.push({ t: s.ts, v: s.active||0 }); h.httpErrors.push({ t: s.ts, v: s.errors||0 }); h.httpAvgRt.push({ t: s.ts, v: s.avg_rt||0 }); });
        (dbH.samples||[]).forEach(s=> { h.dbActive.push({ t: s.ts, v: s.active||0 }); h.dbErrors.push({ t: s.ts, v: s.errors||0 }); h.dbAvg.push({ t: s.ts, v: s.avg_ms||0 }); });
        (aiH.samples||[]).forEach(s=> h.aiAvg.push({ t: s.ts, v: s.avg_ms||0 }));
        // WebSocket active + derive msgs/sec from cumulative sent+recv
        const wsSamples = (wsH.samples||[]).slice().sort((a,b)=>a.ts-b.ts);
        let prevWs = null;
        wsSamples.forEach(s=>{
          h.wsActive.push({ t: s.ts, v: s.active||0 });
          if (prevWs) {
            const dt = Math.max(1, (s.ts - prevWs.ts) / 1000);
            const totalPrev = (prevWs.msg_sent||0) + (prevWs.msg_recv||0);
            const totalNow = (s.msg_sent||0) + (s.msg_recv||0);
            const d = Math.max(0, totalNow - totalPrev);
            h.wsMsgsPerSec.push({ t: s.ts, v: Math.round(d/dt) });
          }
          prevWs = s;
        });
        (scrapH.samples||[]).forEach(s=> h.scrapyArticles.push({ t: s.ts, v: s.last_articles||0 }));
      } catch (e) { /* ignore */ }
      finally {
        fetchMetrics();
      }
    })();
    let rafId;
    const step = () => {
      drawAllCharts();
      drawOverviewCharts();
      rafId = requestAnimationFrame(step);
    };
    rafId = requestAnimationFrame(step);

    return () => {
      if (socketRef.current) {
        socketRef.current.disconnect();
      }
      if (rafId) cancelAnimationFrame(rafId);
    };
  }, []);

  // Bridge test results into Scrapping Status left panel
  useEffect(() => {
    const handler = (ev) => {
      const { result } = ev.detail || {};
      const container = document.getElementById('scraping-probes');
      if (!container) return;
      container.innerHTML = '';
      if (!result || !Array.isArray(result.bySource)) return;
      const ok = result.bySource.filter(s=>s.ok).length;
      const fail = result.bySource.length - ok;
      const header = document.createElement('div');
      header.className = 'mb-2 text-gray-700';
      header.textContent = `Sources: ${ok} ok, ${fail} error`;
      container.appendChild(header);
      const ul = document.createElement('ul');
      ul.className = 'space-y-1';
      result.bySource.forEach((s) => {
        const li = document.createElement('li');
        li.className = `flex justify-between items-center px-2 py-1 rounded ${s.ok ? 'bg-white' : 'bg-red-50'}`;
        const left = document.createElement('span');
        left.className = 'truncate mr-2';
        left.title = s.url;
        left.textContent = s.url;
        const right = document.createElement('span');
        right.className = `ml-2 text-right ${s.ok ? 'text-emerald-600' : 'text-red-600'}`;
        right.textContent = s.ok ? `${s.status || 200} • ${s.durationMs}ms` : `${s.error || 'fail'} • ${s.durationMs}ms`;
        li.appendChild(left);
        li.appendChild(right);
        ul.appendChild(li);
      });
      container.appendChild(ul);
    };
    window.addEventListener('scraping-test-result', handler);
    return () => window.removeEventListener('scraping-test-result', handler);
  }, []);

  // Redraw on window resize
  useEffect(() => {
    const onResize = () => drawAllCharts();
    window.addEventListener('resize', onResize);
    return () => window.removeEventListener('resize', onResize);
  }, []);

  // Mouse wheel to zoom window on all charts
  useEffect(() => {
    const makeWheel = () => (e) => {
      e.preventDefault();
      const factor = e.deltaY > 0 ? 1.2 : 0.8;
      const next = Math.min(24 * 60 * 60 * 1000, Math.max(5 * 60 * 1000, Math.round(windowMs * factor)));
      setWindowMs(next);
      requestAnimationFrame(drawAllCharts);
    };
    const canvases = [cpuCanvasRef.current, memCanvasRef.current, gpuCanvasRef.current].filter(Boolean);
    const handlers = canvases.map(() => makeWheel());
    canvases.forEach((c, i) => c.addEventListener('wheel', handlers[i], { passive: false }));
    return () => canvases.forEach((c, i) => c.removeEventListener('wheel', handlers[i]));
  }, [windowMs]);
  const drawSingleChart = (canvas, seriesKey, color) => {
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    const dpr = window.devicePixelRatio || 1;
    const width = canvas.clientWidth * dpr;
    const height = canvas.clientHeight * dpr;
    if (canvas.width !== width) canvas.width = width;
    if (canvas.height !== height) canvas.height = height;
    ctx.clearRect(0, 0, width, height);

    const padding = 30 * dpr;
    const chartW = width - padding * 2;
    const chartH = height - padding * 2;
    const now = Date.now();
    const h = historyRef.current;
    const count = h[seriesKey].length;
    const growTarget = 2 * 60 * 60 * 1000;
    const dynamicShort = Math.min(growTarget, Math.max(minWindowMs, (count + 60) * 1000));
    const longWindow = windowMs;

    // Axes
    ctx.strokeStyle = 'rgba(0,0,0,0.1)';
    ctx.lineWidth = 1 * dpr;
    ctx.beginPath();
    ctx.moveTo(padding, padding);
    ctx.lineTo(padding, padding + chartH);
    ctx.lineTo(padding + chartW, padding + chartH);
    ctx.stroke();
    for (let yPct = 0; yPct <= 100; yPct += 25) {
      const y = padding + chartH - (yPct / 100) * chartH;
      ctx.strokeStyle = 'rgba(0,0,0,0.06)';
      ctx.beginPath();
      ctx.moveTo(padding, y);
      ctx.lineTo(padding + chartW, y);
      ctx.stroke();
      ctx.fillStyle = 'rgba(0,0,0,0.4)';
      ctx.font = `${10 * dpr}px sans-serif`;
      ctx.fillText(`${yPct}%`, 4 * dpr, y + 3 * dpr);
    }

    // Long window line
    const longMinT = now - longWindow;
    const ptsL = h[seriesKey].filter(p => p.t >= longMinT);
    if (ptsL.length >= 2) {
      ctx.strokeStyle = color;
      ctx.lineWidth = 2 * dpr;
      ctx.beginPath();
      ptsL.forEach((p, i) => {
        const x = padding + ((p.t - longMinT) / longWindow) * chartW;
        const y = padding + chartH - (Math.max(0, Math.min(100, p.v)) / 100) * chartH;
        if (i === 0) ctx.moveTo(x, y); else ctx.lineTo(x, y);
      });
      ctx.stroke();
    }

    // Short window overlay
    const shortMinT = now - dynamicShort;
    const ptsS = h[seriesKey].filter(p => p.t >= shortMinT);
    if (ptsS.length >= 2) {
      const alphaColor = seriesKey === 'cpu' ? 'rgba(59,130,246,0.6)' : (seriesKey === 'memory' ? 'rgba(16,185,129,0.6)' : 'rgba(168,85,247,0.6)');
      ctx.strokeStyle = alphaColor;
      ctx.lineWidth = 1.5 * dpr;
      ctx.beginPath();
      ptsS.forEach((p, i) => {
        const x = padding + ((p.t - shortMinT) / dynamicShort) * chartW;
        const y = padding + chartH - (Math.max(0, Math.min(100, p.v)) / 100) * chartH;
        if (i === 0) ctx.moveTo(x, y); else ctx.lineTo(x, y);
      });
      ctx.stroke();
    }

    // Extra: if GPU, overlay GPU memory percentage as second series
    if (seriesKey === 'gpu') {
      const memPtsL = h.gpuMemory.filter(p => p.t >= longMinT);
      if (memPtsL.length >= 2) {
        ctx.strokeStyle = '#f97316'; // orange for GPU memory
        ctx.lineWidth = 2 * dpr;
        ctx.beginPath();
        memPtsL.forEach((p, i) => {
          const x = padding + ((p.t - longMinT) / longWindow) * chartW;
          const y = padding + chartH - (Math.max(0, Math.min(100, p.v)) / 100) * chartH;
          if (i === 0) ctx.moveTo(x, y); else ctx.lineTo(x, y);
        });
        ctx.stroke();
      }
      const memPtsS = h.gpuMemory.filter(p => p.t >= shortMinT);
      if (memPtsS.length >= 2) {
        ctx.strokeStyle = 'rgba(249,115,22,0.6)'; // orange alpha
        ctx.lineWidth = 1.5 * dpr;
        ctx.beginPath();
        memPtsS.forEach((p, i) => {
          const x = padding + ((p.t - shortMinT) / dynamicShort) * chartW;
          const y = padding + chartH - (Math.max(0, Math.min(100, p.v)) / 100) * chartH;
          if (i === 0) ctx.moveTo(x, y); else ctx.lineTo(x, y);
        });
        ctx.stroke();
      }
      // Legend
      ctx.font = `${10 * dpr}px sans-serif`;
      ctx.fillStyle = 'rgba(0,0,0,0.6)';
      ctx.fillText('GPU load', padding, padding - 12 * dpr);
      ctx.fillText('GPU memory', padding + 90 * dpr, padding - 12 * dpr);
      ctx.fillStyle = '#a855f7'; ctx.fillRect(padding - 16 * dpr, padding - 18 * dpr, 12 * dpr, 4 * dpr);
      ctx.fillStyle = '#f97316'; ctx.fillRect(padding + 74 * dpr, padding - 18 * dpr, 12 * dpr, 4 * dpr);
    }
  };

  const drawAllCharts = () => {
    drawSingleChart(cpuCanvasRef.current, 'cpu', '#3b82f6');
    drawSingleChart(memCanvasRef.current, 'memory', '#10b981');
    drawSingleChart(gpuCanvasRef.current, 'gpu', '#a855f7');
    // Per-tab charts (2h window)
    const now = Date.now();
    const twoH = 2 * 60 * 60 * 1000;
    const drawSeries = (canvas, key, color, normalize100=false) => {
      if (!canvas) return;
      const ctx = canvas.getContext('2d');
      const dpr = window.devicePixelRatio || 1;
      const width = canvas.clientWidth * dpr;
      const height = canvas.clientHeight * dpr;
      if (canvas.width !== width) canvas.width = width;
      if (canvas.height !== height) canvas.height = height;
      ctx.clearRect(0,0,width,height);
      const padding = 8 * dpr;
      const chartW = width - padding*2;
      const chartH = height - padding*2;
      const minT = now - twoH;
      const pts = historyRef.current[key].filter(p=>p.t>=minT).slice().sort((a,b)=>a.t-b.t);
      ctx.strokeStyle = 'rgba(0,0,0,0.08)';
      ctx.beginPath(); ctx.moveTo(padding, padding+chartH); ctx.lineTo(padding+chartW, padding+chartH); ctx.stroke();
      if (pts.length < 2) return;
      const maxV = normalize100 ? 100 : Math.max(1, ...pts.map(p=>p.v));
      ctx.strokeStyle = color; ctx.lineWidth = 2 * dpr; ctx.beginPath();
      let prevT = null;
      const GAP_MS = 20000; // break line on gaps >20s to avoid long diagonals
      pts.forEach((p,i)=>{
        const x = padding + ((p.t - minT)/twoH) * chartW;
        const y = padding + chartH - (Math.max(0, Math.min(maxV, p.v)) / maxV) * chartH;
        if (i===0 || (prevT && (p.t - prevT) > GAP_MS)) { ctx.moveTo(x,y); }
        else { ctx.lineTo(x,y); }
        prevT = p.t;
      });
      ctx.stroke();
    };
    drawSeries(httpActiveChartRef.current, 'httpActive', '#0ea5e9');
    drawSeries(httpErrorsChartRef.current, 'httpErrors', '#ef4444');
    drawSeries(httpAvgRtChartRef.current, 'httpAvgRt', '#8b5cf6');
    drawSeries(wsActiveChartRef.current, 'wsActive', '#f59e0b');
    drawSeries(wsMsgsChartRef.current, 'wsMsgsPerSec', '#10b981');
    drawSeries(dbActiveChartRef.current, 'dbActive', '#22c55e');
    drawSeries(dbErrorsChartRef.current, 'dbErrors', '#ef4444');
    drawSeries(dbAvgChartRef.current, 'dbAvg', '#6366f1');
  };

  const MINI_WINDOW_DEFAULT_MS = 15 * 60 * 1000; // 15m
  const MINI_WINDOW_FAST_MS = 3 * 60 * 1000; // 3m for CPU/Mem/GPU

  const drawMini = (canvas, seriesKey, color, windowMsOverride) => {
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    const dpr = window.devicePixelRatio || 1;
    const width = canvas.clientWidth * dpr;
    const height = canvas.clientHeight * dpr;
    if (canvas.width !== width) canvas.width = width;
    if (canvas.height !== height) canvas.height = height;
    ctx.clearRect(0, 0, width, height);
    const padding = 6 * dpr;
    const chartW = width - padding * 2;
    const chartH = height - padding * 2;
    const now = Date.now();
    const windowMsLocal = windowMsOverride || MINI_WINDOW_DEFAULT_MS;
    const minT = now - windowMsLocal;
    const points = historyRef.current[seriesKey].filter(p => p.t >= minT);
    // Axis baseline
    ctx.strokeStyle = 'rgba(0,0,0,0.08)';
    ctx.beginPath();
    ctx.moveTo(padding, padding + chartH);
    ctx.lineTo(padding + chartW, padding + chartH);
    ctx.stroke();
    if (points.length < 2) return;
    ctx.strokeStyle = color;
    ctx.lineWidth = 3 * dpr;
    ctx.beginPath();
    points.forEach((p, i) => {
      const x = padding + ((p.t - minT) / windowMsLocal) * chartW;
      const y = padding + chartH - (Math.max(0, Math.min(100, p.v)) / 100) * chartH;
      if (i === 0) ctx.moveTo(x, y); else ctx.lineTo(x, y);
    });
    ctx.stroke();
  };

  const drawOverviewCharts = () => {
    drawMini(miniCpuRef.current, 'cpu', '#3b82f6', MINI_WINDOW_FAST_MS);
    drawMini(miniMemRef.current, 'memory', '#10b981', MINI_WINDOW_FAST_MS);
    drawMini(miniGpuRef.current, 'gpu', '#a855f7', MINI_WINDOW_FAST_MS);
    drawMini(miniHttpRef.current, 'httpActive', '#0ea5e9', MINI_WINDOW_DEFAULT_MS);
    drawMini(miniWsRef.current, 'wsActive', '#f59e0b', MINI_WINDOW_DEFAULT_MS);
    drawMini(miniDbRef.current, 'dbActive', '#22c55e', MINI_WINDOW_DEFAULT_MS);
    drawMini(miniAiRef.current, 'aiAvg', '#8b5cf6', MINI_WINDOW_DEFAULT_MS);
    drawMini(miniScrapRef.current, 'scrapyArticles', '#ef4444', MINI_WINDOW_DEFAULT_MS);
  };

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

  // Modal for bucket details
  const [modalOpen, setModalOpen] = useState(false);
  const [modalTitle, setModalTitle] = useState('');
  const [modalItems, setModalItems] = useState([]);

  const openBucketDetails = (title, startTs, bucketMs, sourceKeys) => {
    const endTs = startTs + bucketMs;
    const items = [];
    sourceKeys.forEach((key) => {
      const series = historyRef.current[key] || [];
      series.forEach((p) => {
        if (p.t >= startTs && p.t < endTs) items.push({ t: p.t, v: p.v, key });
      });
    });
    items.sort((a, b) => a.t - b.t);
    setModalTitle(`${title} — ${new Date(startTs).toLocaleTimeString()} - ${new Date(endTs).toLocaleTimeString()}`);
    setModalItems(items);
    setModalOpen(true);
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
      <div className="bg-white shadow-sm border-b sticky top-0 z-10">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex justify-between items-center py-4">
            <div className="flex items-center">
              <h1 className="text-2xl font-bold text-gray-900">System</h1>
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
      <div className="bg-white border-b sticky top-[64px] z-10">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex space-x-8">
            {['overview', 'http', 'websocket', 'database', 'api', 'ai', 'scrapping', 'logs'].map((tab) => (
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
        <BucketModal open={modalOpen} title={modalTitle} items={modalItems} onClose={()=>setModalOpen(false)} />
        {/* Overview Tab */}
        {activeTab === 'overview' && (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
            {/* System Overview with mini charts */}
            <div className="bg-white rounded-lg shadow p-6 lg:col-span-2">
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
                <div>
                  <div className="flex justify-between text-sm mb-1">
                    <span className="text-gray-600">Memory</span>
                    <span className="font-medium">{metrics.system?.memory?.percentage || 0}%</span>
                  </div>
                  <div className="w-full h-24 bg-gray-50 rounded border">
                    <canvas ref={miniMemRef} style={{ width: '100%', height: '100%' }} />
                  </div>
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
          </div>
        )}

        {/* API Tab */}
        {activeTab === 'api' && (
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
                ) : (<p className="text-sm text-gray-500">No route data</p>) })()}
              </div>
            </div>

            {(() => { const routeEntries = getEntries(metrics?.http?.routes); return routeEntries.length > 0 ? (
              <div className="bg-white rounded-lg shadow p-6">
                <h3 className="text-lg font-semibold text-gray-900 mb-4">Routes (live)</h3>
                <div className="overflow-x-auto">
                  <table className="min-w-full text-sm">
                    <thead>
                      <tr className="border-b">
                        <th className="text-left py-2">Route</th>
                        <th className="text-left py-2">Requests</th>
                        <th className="text-left py-2">Errors</th>
                        <th className="text-left py-2">Avg Time</th>
                        <th className="text-left py-2">Total Time</th>
                      </tr>
                    </thead>
                    <tbody>
                      {routeEntries.sort((a,b)=> (b[1]?.requests||0)-(a[1]?.requests||0)).map(([route, s]) => (
                        <tr key={route} className="border-b">
                          <td className="py-2 font-mono">{route}</td>
                          <td className="py-2">{s?.requests||0}</td>
                          <td className="py-2 text-red-500">{s?.errors||0}</td>
                          <td className="py-2">{Math.round(s?.avgTime||0)}ms</td>
                          <td className="py-2">{Math.round(s?.totalTime||0)}ms</td>
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
            <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
              {/* KPIs */}
              <div className="bg-white rounded-lg shadow p-6">
                <h3 className="text-lg font-semibold text-gray-900 mb-2">KPIs (last 10m)</h3>
                <div className="grid grid-cols-3 gap-4 text-center">
                  <div>
                    <div className="text-xs text-gray-500">Active</div>
                    <div className="text-2xl font-semibold text-amber-600">{metrics.websocket?.connections?.active || 0}</div>
                  </div>
                  <div>
                    <div className="text-xs text-gray-500">Msgs/s</div>
                    <div className="text-2xl font-semibold text-emerald-600">{historyRef.current.wsMsgsPerSec.slice(-10).reduce((a,b)=>a+(b?.v||0),0)}</div>
                  </div>
                  <div>
                    <div className="text-xs text-gray-500">Total Msgs</div>
                    <div className="text-2xl font-semibold text-gray-700">{(metrics.websocket?.messages?.sent||0)+(metrics.websocket?.messages?.received||0)}</div>
                  </div>
                </div>
              </div>
              {/* Bars */}
              <div className="bg-white rounded-lg shadow p-6 lg:col-span-2">
                <h3 className="text-lg font-semibold text-gray-900 mb-2">Last 10 minutes</h3>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                  <div className="h-56">
                    <Bar
                      data={makeBarDataset('wsActive','Active','rgba(245,158,11,0.7)','max')}
                      options={{
                        responsive:true, maintainAspectRatio:false, plugins:{ legend:{display:false},
                          tooltip:{
                            callbacks:{
                              afterBody: (ctx)=>{ const d=ctx[0].dataset; const idx=ctx[0].dataIndex; const start=d.bucketStartTs[idx]; return `Window: ${new Date(start).toLocaleTimeString()}-${new Date(start+d.bucketMs).toLocaleTimeString()}`; }
                            }
                          }
                        }, scales:{ y:{ beginAtZero:true, ticks:{ precision:0 } } },
                        onClick: (evt, elements)=>{ if (!elements?.length) return; const el=elements[0]; const d=el.dataset; const idx=el.index; openBucketDetails('WebSocket Active', d.bucketStartTs[idx], d.bucketMs, ['wsActive']); }
                      }}
                    />
                  </div>
                  <div className="h-56">
                    <Bar
                      data={makeBarDataset('wsMsgsPerSec','Msgs/s','rgba(16,185,129,0.7)','avg')}
                      options={{
                        responsive:true, maintainAspectRatio:false, plugins:{ legend:{display:false},
                          tooltip:{ callbacks:{ afterBody:(ctx)=>{ const d=ctx[0].dataset; const idx=ctx[0].dataIndex; const start=d.bucketStartTs[idx]; return `Window: ${new Date(start).toLocaleTimeString()}-${new Date(start+d.bucketMs).toLocaleTimeString()}`; } } }
                        }, scales:{ y:{ beginAtZero:true, ticks:{ precision:0 } } },
                        onClick: (evt, elements)=>{ if (!elements?.length) return; const el=elements[0]; const d=el.dataset; const idx=el.index; openBucketDetails('WebSocket Msgs/s', d.bucketStartTs[idx], d.bucketMs, ['wsMsgsPerSec']); }
                      }}
                    />
                  </div>
                </div>
              </div>
            </div>

            <div className="bg-white rounded-lg shadow p-6">
              <h3 className="text-lg font-semibold text-gray-900 mb-4">Active Clients</h3>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4 max-h-80 overflow-y-auto">
                {metrics.websocket?.clients && metrics.websocket.clients.size > 0 ? (
                  Array.from(metrics.websocket.clients.entries()).map(([clientId, client]) => (
                    <div key={clientId} className="border rounded p-3">
                      <div className="text-sm font-medium">Client: {clientId.substr(0, 10)}...</div>
                      <div className="text-xs text-gray-500 mt-1">IP: {client.ip} • Connected: {formatUptime(Date.now() - client.connectedAt)}</div>
                      <div className="text-xs text-gray-500">Sent: {client.messagesSent} | Received: {client.messagesReceived}</div>
                    </div>
                  ))
                ) : (<p className="text-gray-500 text-sm">No active WebSocket clients</p>)}
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
          <div className="space-y-6">
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
              <div className="bg-white rounded-lg shadow p-6 lg:col-span-2">
                <AISettingsInline />
              </div>
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

            <div className="bg-white rounded-xl shadow-2xl p-6">
              <AIDashboard inline={true} onClose={() => {}} />
            </div>
          </div>
        )}

        {/* Scrapping Tab */}
        {activeTab === 'scrapping' && (
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            <div className="bg-white rounded-lg shadow p-6">
              <h3 className="text-lg font-semibold text-gray-900 mb-4">Scrapping Status</h3>
              <div className="space-y-3">
                <div className="flex justify-between">
                  <span className="text-gray-600">Status</span>
                  <span className={`font-medium capitalize ${getStatusColor(metrics.scrapy?.status)}`} title={`Library: ${metrics.scrapy?.library || 'scrapy'}`}>
                    {metrics.scrapy?.status || 'idle'}
                  </span>
                </div>
                <div className="flex justify-between">
                  <span className="text-gray-600">Articles (last run)</span>
                  <span className="font-medium">{metrics.scrapy?.lastRunArticles || 0}</span>
                </div>
                <div className="w-full h-10 bg-gray-50 rounded border">
                  <canvas ref={miniScrapRef} style={{ width: '100%', height: '100%' }} />
                </div>
                <div className="flex justify-between">
                  <span className="text-gray-600">Errors (last run)</span>
                  <span className="font-medium text-red-500">{metrics.scrapy?.lastRunErrors || 0}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-gray-600">Last Run Time</span>
                  <span className="font-medium">{Math.round(metrics.scrapy?.lastProcessingTime || 0)}ms</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-gray-600">Avg Processing Time</span>
                  <span className="font-medium">{Math.round(metrics.scrapy?.avgProcessingTime || 0)}ms</span>
                </div>
                {/* Per-source probes area */}
                <div className="mt-4">
                  <div className="text-sm font-medium text-gray-700 mb-1">Last Test Sources</div>
                  <div id="scraping-probes" className="max-h-44 overflow-auto border rounded p-2 bg-gray-50 text-xs"></div>
                </div>
              </div>
            </div>

            <div className="bg-white rounded-lg shadow p-6">
              <h3 className="text-lg font-semibold text-gray-900 mb-4">Libraries</h3>
              <ScrapingLibrariesPanel />
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