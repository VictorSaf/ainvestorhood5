import React, { useEffect, useRef, useState } from 'react';

const WebsocketHistoryChart = ({ type = 'connections' }) => {
  const canvasRef = useRef(null);
  const historyRef = useRef([]);
  const [windowMs, setWindowMs] = useState(2 * 60 * 60 * 1000);
  const [minWindowMs] = useState(5 * 60 * 1000);
  const [paused, setPaused] = useState(false);

  useEffect(() => {
    let mounted = true;
    (async () => {
      try {
        const since = Date.now() - 2 * 60 * 60 * 1000;
        const resp = await fetch(`http://localhost:8080/api/websocket-metrics/history?sinceMs=${since}`);
        const data = await resp.json();
        const key = type === 'connections' ? 'active' : null;
        historyRef.current = (data.samples || []).map(s => ({ t: s.ts, 
          v: type === 'connections' ? (s.active || 0) : ((s.msg_sent || 0) + (s.msg_recv || 0))
        }));
      } catch {}
      if (mounted) requestAnimationFrame(draw);
    })();
    return () => { mounted = false; };
  }, [type]);

  useEffect(() => {
    const onWheel = (e) => {
      e.preventDefault();
      const factor = e.deltaY > 0 ? 1.2 : 0.8;
      const next = Math.min(24 * 60 * 60 * 1000, Math.max(5 * 60 * 1000, Math.round(windowMs * factor)));
      setWindowMs(next);
      requestAnimationFrame(draw);
    };
    const c = canvasRef.current;
    if (!c) return;
    c.addEventListener('wheel', onWheel, { passive: false });
    return () => c.removeEventListener('wheel', onWheel);
  }, [windowMs]);

  useEffect(() => {
    let rafId;
    const step = () => { draw(); rafId = requestAnimationFrame(step); };
    rafId = requestAnimationFrame(step);
    return () => cancelAnimationFrame(rafId);
  }, []);

  // Subscribe to live websocket metrics via window event hooked by MonitoringDashboard
  useEffect(() => {
    const handler = (e) => {
      if (paused) return;
      const ws = e.detail;
      const t = Date.now();
      const v = type === 'connections' ? (ws?.connections?.active || 0) : ((ws?.messages?.sent||0) + (ws?.messages?.received||0));
      historyRef.current.push({ t, v });
      if (historyRef.current.length > 8000) historyRef.current.shift();
    };
    window.addEventListener('ws-metrics', handler);
    return () => window.removeEventListener('ws-metrics', handler);
  }, [type, paused]);

  const draw = () => {
    const canvas = canvasRef.current;
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
    const count = historyRef.current.length;
    const growTarget = 2 * 60 * 60 * 1000;
    const dynamicShort = Math.min(growTarget, Math.max(minWindowMs, (count + 60) * 1000));
    const longWindow = windowMs;
    const longMinT = now - longWindow;
    const shortMinT = now - dynamicShort;

    // Axes
    ctx.strokeStyle = 'rgba(0,0,0,0.1)';
    ctx.lineWidth = 1 * dpr;
    ctx.beginPath();
    ctx.moveTo(padding, padding);
    ctx.lineTo(padding, padding + chartH);
    ctx.lineTo(padding + chartW, padding + chartH);
    ctx.stroke();

    // Long line
    const ptsL = historyRef.current.filter(p => p.t >= longMinT);
    if (ptsL.length >= 2) {
      ctx.strokeStyle = type === 'connections' ? '#f59e0b' : '#3b82f6';
      ctx.lineWidth = 2 * dpr;
      ctx.beginPath();
      const maxV = Math.max(1, ...ptsL.map(p=>p.v));
      ptsL.forEach((p, i) => {
        const x = padding + ((p.t - longMinT) / longWindow) * chartW;
        const y = padding + chartH - (p.v / maxV) * chartH;
        if (i === 0) ctx.moveTo(x, y); else ctx.lineTo(x, y);
      });
      ctx.stroke();
    }

    // Short overlay
    const ptsS = historyRef.current.filter(p => p.t >= shortMinT);
    if (ptsS.length >= 2) {
      ctx.strokeStyle = type === 'connections' ? 'rgba(245,158,11,0.6)' : 'rgba(59,130,246,0.6)';
      ctx.lineWidth = 1.5 * dpr;
      ctx.beginPath();
      const maxS = Math.max(1, ...ptsS.map(p=>p.v));
      ptsS.forEach((p, i) => {
        const x = padding + ((p.t - shortMinT) / dynamicShort) * chartW;
        const y = padding + chartH - (p.v / maxS) * chartH;
        if (i === 0) ctx.moveTo(x, y); else ctx.lineTo(x, y);
      });
      ctx.stroke();
    }
  };

  return (
    <div>
      <div className="w-full h-44 bg-gray-50 rounded border mb-2">
        <canvas ref={canvasRef} style={{ width: '100%', height: '100%' }} />
      </div>
      <div className="flex items-center gap-3 text-xs text-gray-600">
        <span>Window: {Math.round(windowMs/60000)}m</span>
        <button className="px-2 py-0.5 border rounded" onClick={()=>setWindowMs(Math.max(5*60*1000, Math.round(windowMs*0.8)))}>−</button>
        <button className="px-2 py-0.5 border rounded" onClick={()=>setWindowMs(Math.min(24*60*60*1000, Math.round(windowMs*1.25)))}>+</button>
        <label className="ml-2 flex items-center gap-1"><input type="checkbox" checked={paused} onChange={e=>setPaused(e.target.checked)} /> Pause ingest</label>
      </div>
    </div>
  );
};

export default WebsocketHistoryChart;


