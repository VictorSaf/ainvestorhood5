import React, { useEffect, useMemo, useRef, useState } from 'react';
import { Virtuoso } from 'react-virtuoso';
import { io } from 'socket.io-client';
import axios from 'axios';
import { X, TerminalSquare } from 'lucide-react';

// Fresh, compact debug page per request: category cards with live streams, errors in red, click to view details; below them one consolidated Errors card.
const LiveDebugOverlay = ({ open, onClose }) => {
  const [socketConnected, setSocketConnected] = useState(false);
  const [logs, setLogs] = useState([]);
  const [autoScroll, setAutoScroll] = useState(true);
  const [perfMode, setPerfMode] = useState(true);
  const [scraperLib, setScraperLib] = useState('');
  const [copiedMsg, setCopiedMsg] = useState('');
  const logEndRef = useRef(null);
  const flushTimerRef = useRef(null); // legacy; no longer used
  const isHiddenRef = useRef(false);
  const pendingRef = useRef([]);
  const rafRef = useRef(0);
  const flushTimeoutRef = useRef(0);

  useEffect(() => {
    if (!open) return;
    const s = io('http://localhost:8080');
    s.on('connect', () => setSocketConnected(true));
    s.on('disconnect', () => setSocketConnected(false));
    // legacy flush kept for backward compatibility (no longer used with worker)
    // local scheduler retained for legacy path; currently unused when worker is active
    // Init ingest worker
    const worker = new Worker(new URL('../workers/debugIngest.js', import.meta.url));
    // Perf mode: fewer UI updates by batching more aggressively
    worker.postMessage({ type: 'config', flushMs: perfMode ? 250 : 90 });
    worker.onmessage = (m) => {
      const data = m.data || {};
      if (data.type === 'batch') {
        const entries = data.entries || [];
        // Accumulate entries and flush at ~8fps or next animation frame
        pendingRef.current.push(...entries);
        const flushNow = () => {
          if (pendingRef.current.length === 0) return;
          const toMerge = pendingRef.current.splice(0, pendingRef.current.length);
          setLogs((prev) => {
            const merged = [...prev, ...toMerge];
            return merged.length > 600 ? merged.slice(-600) : merged;
          });
          rafRef.current = 0;
          if (flushTimeoutRef.current) { clearTimeout(flushTimeoutRef.current); flushTimeoutRef.current = 0; }
        };
        if (!rafRef.current) {
          rafRef.current = requestAnimationFrame(flushNow);
          // Safety timeout in case rAF is throttled
          if (!flushTimeoutRef.current) flushTimeoutRef.current = setTimeout(flushNow, 120);
        }
      }
    };

    const forward = (event) => (payload) => {
      if (isHiddenRef.current && perfMode) return;
      worker.postMessage({ type: 'event', ts: new Date().toISOString(), event, payload });
    };
    ['log','systemMetrics','httpMetrics','websocketMetrics','databaseMetrics','aiMetrics','scrapyMetrics','new-article','processing-status','collection-progress','scraper-lib-changed']
      .forEach(evt => s.on(evt, forward(evt)));
    // Fetch current active scrapping library
    (async () => {
      try {
        const resp = await axios.get('http://localhost:8080/api/scraping/libs');
        const libs = resp.data?.libs || [];
        const active = libs.find((l) => l.active);
        setScraperLib(active?.name || active?.key || 'Unknown');
      } catch {
        setScraperLib('Unknown');
      }
    })();
    // Update on change events
    s.on('scraper-lib-changed', async () => {
      try {
        const resp = await axios.get('http://localhost:8080/api/scraping/libs');
        const libs = resp.data?.libs || [];
        const active = libs.find((l) => l.active);
        setScraperLib(active?.name || active?.key || 'Unknown');
      } catch {}
    });
    return () => {
      s.disconnect();
      if (flushTimerRef.current) { clearTimeout(flushTimerRef.current); flushTimerRef.current=null; }
      if (rafRef.current) cancelAnimationFrame(rafRef.current);
      if (flushTimeoutRef.current) clearTimeout(flushTimeoutRef.current);
      rafRef.current = 0; flushTimeoutRef.current = 0; pendingRef.current = [];
    };
  }, [open, perfMode]);

  // Pause/resume ingest when tab visibility changes (perf)
  useEffect(() => {
    const onVis = () => { isHiddenRef.current = document.hidden; };
    document.addEventListener('visibilitychange', onVis);
    onVis();
    return () => document.removeEventListener('visibilitychange', onVis);
  }, []);

  useEffect(() => { if (autoScroll && logEndRef.current) logEndRef.current.scrollIntoView({ behavior: 'auto' }); }, [logs, autoScroll]);

  const classify = (entry) => {
    const e = entry.event;
    if (e === 'aiMetrics' || (e === 'log' && /AI|ollama|openai/i.test(JSON.stringify(entry.payload)))) return 'AI';
    if (e === 'scrapyMetrics' || (e === 'log' && /Scrapy|scraper/i.test(JSON.stringify(entry.payload)))) return 'Scrapping';
    if (e === 'httpMetrics' || (e === 'log' && /HTTP_|HTTP\sREQUEST/i.test(JSON.stringify(entry.payload)))) return 'HTTP';
    if (e === 'databaseMetrics' || (e === 'log' && /Database|SQLite|news_articles/i.test(JSON.stringify(entry.payload)))) return 'Database';
    if (e === 'websocketMetrics' || e === 'new-article' || e === 'processing-status' || e === 'articles-sync') return 'WebSocket';
    if (e === 'systemMetrics') return 'System';
    return 'Other';
  };

  const recent = useMemo(() => logs.slice(-200), [logs]);

  const latestOf = (eventName) => { for (let i = recent.length - 1; i >= 0; i--) if (recent[i].event === eventName) return recent[i]; return null; };

  const cardStats = (cat) => {
    try {
      if (cat === 'HTTP') {
        const m = latestOf('httpMetrics')?.payload || {};
        const computedErr = recent.filter((l) => {
          if (l.event !== 'log') return false;
          const ev = l.payload?.event || '';
          const lvl = (l.payload?.level || '').toUpperCase();
          const sc = l.payload?.data?.statusCode;
          return (/HTTP_REQUEST_(END|TIMEOUT)/.test(ev) && (lvl === 'ERROR' || lvl === 'WARN' || (typeof sc === 'number' && sc >= 400)));
        }).length;
        return [
          { k: 'active', v: m.requests?.active },
          { k: 'err', v: Math.max(computedErr, (m.requests?.errors || 0) + (m.responses?.error || 0)) }
        ];
      }
      if (cat === 'Database') {
        const m = latestOf('databaseMetrics')?.payload || {};
        const computedErr = recent.filter((l) => {
          if (l.event !== 'log') return false;
          const ev = l.payload?.event || '';
          const lvl = (l.payload?.level || '').toUpperCase();
          return ((/DATABASE_QUERY_ERROR|DATABASE_QUERY_TIMEOUT/.test(ev)) && (lvl === 'ERROR' || lvl === 'WARN'));
        }).length;
        return [
          { k: 'queries', v: m.queries?.total },
          { k: 'err', v: Math.max(computedErr, m.queries?.errors || 0) }
        ];
      }
      if (cat === 'WebSocket') { const m = latestOf('websocketMetrics')?.payload || {}; return [
        { k: 'conn', v: m.connections?.active }, { k: 'sent', v: m.messages?.sent }]; }
      if (cat === 'Scrapy') { const m = latestOf('scrapyMetrics')?.payload || {}; return [
        { k: 'status', v: m.status||'-' }, { k: 'last', v: m.lastRunArticles??'-' }]; }
      if (cat === 'System') { const m = latestOf('systemMetrics')?.payload || {}; return [
        { k: 'cpu', v: m.cpu?.usage!=null?m.cpu.usage+'%':'-' }, { k: 'mem', v: m.memory?.percentage!=null?m.memory.percentage+'%':'-' }]; }
      if (cat === 'AI') { const m = latestOf('aiMetrics')?.payload || {}; return [
        { k: 'req', v: m.requests?.total??'-' }, { k: 'act', v: m.requests?.active??'-' }]; }
    } catch {}
    return [];
  };

  const summarize = (cat, entry) => {
    const p = entry.payload || {}; const t = entry.event;
    try {
      if (cat==='HTTP'&&t==='httpMetrics') {
        const perRoute = p.routes && typeof p.routes === 'object' ? Object.entries(p.routes) : [];
        const errSum = (p.requests?.errors||0) + (p.responses?.error||0);
        const top = perRoute
          .map(([route, r]) => ({ route, err: r?.errors||0, avg: Math.round(r?.avgTime||0) }))
          .sort((a,b)=>b.err-a.err).slice(0,1)[0];
        const topStr = top && top.err>0 ? `, worst ${top.route} (${top.err})` : '';
        return `active ${p.requests?.active||0}, err ${errSum}${topStr}`;
      }
      if (cat==='Database'&&t==='databaseMetrics') return `queries ${p.queries?.total||0}, err ${p.queries?.errors||0}`;
      if (cat==='WebSocket'&&t==='websocketMetrics') return `conn ${p.connections?.active||0}, sent ${p.messages?.sent||0}`;
      if (cat==='Scrapy'&&t==='scrapyMetrics') return `status ${p.status||'-'}, last ${p.lastRunArticles??'-'}`;
      if (cat==='AI'&&t==='aiMetrics') return `req ${p.requests?.total??0}, act ${p.requests?.active??0}`;
      if (t==='new-article') return `new article: ${p.article?.title?.slice(0,80)||'unknown'}`;
      if (t==='processing-status') return p.isProcessing? 'processing started':'processing stopped';
    } catch {}
    return JSON.stringify(p).slice(0,140);
  };

  const isEntryError = (entry) => {
    const e = entry?.event;
    const p = entry?.payload || {};
    if (e === 'httpMetrics') {
      const req = p.requests || {}; const resp = p.responses || {};
      return (Number(req.errors)||0) > 0 || (Number(resp.error)||0) > 0;
    }
    if (e === 'databaseMetrics') {
      return (Number(p.queries?.errors)||0) > 0;
    }
    if (e === 'scrapyMetrics') {
      if ((Number(p.lastRunErrors)||0) > 0) return true;
      const st = String(p.status||'');
      return /error|failed/i.test(st);
    }
    if (e === 'log') {
      const level = String(p.level||'').toUpperCase();
      if (level === 'ERROR') return true;
      const ev = String(p.event||'');
      if (/_ERROR|TIMEOUT/.test(ev)) return true;
      const sc = p.data?.statusCode;
      if (typeof sc === 'number' && sc >= 400) return true;
      return false;
    }
    return false;
  };

  const errorEntries = useMemo(() => recent.filter(isEntryError), [recent]);

  const copyEntryDetails = async (entry) => {
    try {
      const prefix = 'asta este o eroare din pagina de debuging, te rog sa o tratezi si sa o rezolvi';
      const header = `[${new Date(entry.ts).toISOString()}] ${entry.event}/${classify(entry)}`;
      const payload = JSON.stringify(entry.payload || {}, null, 2);
      const text = `${prefix}\n\n${header}\n${payload}`;
      await navigator.clipboard.writeText(text);
      setCopiedMsg('Error details copied');
      setTimeout(() => setCopiedMsg(''), 1500);
    } catch {}
  };

  // Combined activity feed (headlines)
  const activityFeed = useMemo(() => {
    return recent.slice(-80).map((l) => ({
      ts: l.ts,
      cat: classify(l),
      event: l.event,
      text: summarize(classify(l), l),
      isError: isEntryError(l),
      entry: l,
    })).reverse();
  }, [recent]);

  // Pre-partition recent by category to avoid repeated filters per card
  const byCategory = useMemo(() => {
    const cats = { AI:[], Scrapping:[], HTTP:[], Database:[], WebSocket:[], System:[], Other:[] };
    for (let i = 0; i < recent.length; i++) {
      const item = recent[i];
      const c = classify(item);
      const list = cats[c] || cats.Other;
      list.push(item);
    }
    return cats;
  }, [recent]);

  // Virtuoso-based virtual list for best-in-class performance
  const VirtualList = ({ items, height, renderItem }) => (
    <Virtuoso
      style={{ height: `${height}px` }}
      totalCount={items.length}
      itemContent={(index) => renderItem(items[index], index)}
      increaseViewportBy={{ top: 120, bottom: 240 }}
      overscan={200}
    />
  );

  // Derive simple service graph edges from recent sequential events (last 30s)
  const serviceGraph = useMemo(() => {
    const windowMs = 30000;
    const now = Date.now();
    const logsInWindow = recent.filter((l) => now - new Date(l.ts).getTime() <= windowMs);
    const edges = new Map(); // key: from->to, value: { count, errorCount, lastTs }
    let prev = null;
    for (const cur of logsInWindow) {
      if (prev) {
        const from = classify(prev);
        const to = classify(cur);
        if (from && to && from !== to) {
          const key = `${from}->${to}`;
          const ex = edges.get(key) || { count: 0, errorCount: 0, lastTs: cur.ts };
          ex.count += 1;
          if (isEntryError(cur)) ex.errorCount += 1;
          ex.lastTs = cur.ts;
          edges.set(key, ex);
        }
      }
      prev = cur;
    }
    return edges;
  }, [recent]);

  // Prepare simple SVG layout for a real graph visualization
  const graphLayout = useMemo(() => {
    const names = ['AI','Scrapping','HTTP','Database','WebSocket','System','Other'];
    const width = 780; const height = 260; const cx = width/2; const cy = height/2; const radius = 90;
    const positions = new Map();
    const step = (2 * Math.PI) / names.length;
    names.forEach((name, idx) => {
      const angle = -Math.PI / 2 + idx * step; // start at top, clockwise
      const x = cx + radius * Math.cos(angle);
      const y = cy + radius * Math.sin(angle);
      positions.set(name, { x, y });
    });
    const nowTs = Date.now();
    const edges = [...serviceGraph.entries()].map(([k,v]) => {
      const [from, to] = k.split('->');
      const a = positions.get(from); const b = positions.get(to);
      if (!a || !b) return null;
      const isHot = nowTs - new Date(v.lastTs).getTime() <= 2000;
      return { from, to, x1: a.x, y1: a.y, x2: b.x, y2: b.y, count: v.count, errorCount: v.errorCount, isHot };
    }).filter(Boolean);
    const hotNodes = new Set();
    const hotSenders = new Set();
    const hotReceivers = new Set();
    edges.forEach((e)=>{ if (e.isHot) { hotNodes.add(e.from); hotNodes.add(e.to); hotSenders.add(e.from); hotReceivers.add(e.to); } });
    return { width, height, positions, edges, hotNodes, hotSenders, hotReceivers };
  }, [serviceGraph]);

  // Canvas-based service graph renderer (faster than SVG for many updates)
  const ServiceGraphCanvas = ({ graphLayout }) => {
    const canvasRef = useRef(null);
    useEffect(() => {
      const canvas = canvasRef.current;
      if (!canvas) return;
      const ctx = canvas.getContext('2d');
      const { width, height, positions, edges, hotNodes, hotSenders, hotReceivers } = graphLayout;
      canvas.width = width; canvas.height = height;
      // Background
      const grd = ctx.createRadialGradient(width/2, height/2, 40, width/2, height/2, Math.max(width, height)/2);
      grd.addColorStop(0, '#0b1220');
      grd.addColorStop(1, '#0f1a2b');
      ctx.fillStyle = grd; ctx.fillRect(0,0,width,height);
      ctx.lineCap = 'round';
      // Edges
      edges.forEach(e => {
        const grad = ctx.createLinearGradient(e.x1, e.y1, e.x2, e.y2);
        if (e.errorCount>0) { grad.addColorStop(0,'#fca5a5'); grad.addColorStop(1,'#f87171'); }
        else { grad.addColorStop(0,'#60a5fa'); grad.addColorStop(1,'#38bdf8'); }
        ctx.strokeStyle = grad;
        ctx.globalAlpha = e.isHot ? 1 : 0.35;
        ctx.lineWidth = e.isHot ? Math.min(10, 2 + e.count/3) : Math.min(6, 1 + e.count/6);
        ctx.beginPath(); ctx.moveTo(e.x1, e.y1); ctx.lineTo(e.x2, e.y2); ctx.stroke();
        // Arrow head
        const angle = Math.atan2(e.y2 - e.y1, e.x2 - e.x1);
        const len = 8;
        ctx.beginPath();
        ctx.moveTo(e.x2, e.y2);
        ctx.lineTo(e.x2 - len * Math.cos(angle - Math.PI/6), e.y2 - len * Math.sin(angle - Math.PI/6));
        ctx.lineTo(e.x2 - len * Math.cos(angle + Math.PI/6), e.y2 - len * Math.sin(angle + Math.PI/6));
        ctx.closePath(); ctx.fillStyle = e.errorCount>0 ? '#f87171' : '#38bdf8'; ctx.fill();
        // Label
        ctx.globalAlpha = e.isHot ? 1 : 0.6; ctx.fillStyle = e.errorCount>0 ? '#fecaca' : '#93c5fd'; ctx.font = '10px sans-serif';
        ctx.fillText(`${e.count}${e.errorCount>0?`/err ${e.errorCount}`:''}`, (e.x1+e.x2)/2, (e.y1+e.y2)/2);
      });
      // Nodes
      [...positions.entries()].forEach(([name, pos]) => {
        const hot = hotNodes.has(name);
        ctx.globalAlpha = 1;
        ctx.beginPath(); ctx.arc(pos.x, pos.y, hot ? 18 : 16, 0, 2*Math.PI);
        ctx.fillStyle = hot ? '#0ea5e9' : '#1f2937'; ctx.fill();
        ctx.lineWidth = hot ? 3 : 1; ctx.strokeStyle = hotReceivers.has(name) ? '#ef4444' : hotSenders.has(name) ? '#38bdf8' : '#334155'; ctx.stroke();
        ctx.fillStyle = '#e2e8f0'; ctx.font = '10px sans-serif'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
        ctx.fillText(name[0], pos.x, pos.y+1);
        ctx.fillStyle = '#93c5fd'; ctx.font = '10px sans-serif'; ctx.fillText(name, pos.x, pos.y+26);
      });
    }, [graphLayout]);
    return <canvas ref={canvasRef} width={graphLayout.width} height={graphLayout.height} className="rounded-lg shadow-inner" />;
  };

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-[1000] bg-black/80">
      {/* Matrix background */}
      <MatrixBackground />
      <div className="absolute inset-6 rounded-xl shadow-2xl flex flex-col border border-emerald-500/20 bg-gradient-to-b from-slate-950/80 via-slate-900/70 to-slate-950/80">
        <div className="flex items-center justify-between px-4 py-2 border-b">
          <div className="flex items-center gap-2 font-semibold text-emerald-300">
            <TerminalSquare size={18} />
            <span>Live Debug Console</span>
            <span className={`ml-3 text-xs px-2 py-0.5 rounded-full ${socketConnected ? 'bg-emerald-500/20 text-emerald-300' : 'bg-red-500/20 text-red-300'}`}>{socketConnected ? 'Connected' : 'Disconnected'}</span>
          </div>
          <div className="flex items-center gap-3 text-sm text-emerald-200">
            <label className="flex items-center gap-1"><input type="checkbox" checked={perfMode} onChange={(e)=>setPerfMode(e.target.checked)} /> Perf mode</label>
            <label className="flex items-center gap-1"><input type="checkbox" checked={autoScroll} onChange={(e)=>setAutoScroll(e.target.checked)} /> Auto-scroll</label>
            <button onClick={onClose} className="p-2 hover:bg-slate-800 rounded text-emerald-300"><X size={18} /></button>
          </div>
        </div>

        {/* Hero Service Graph */}
        <div className="px-3 py-2 border-b bg-transparent">
          <div className="rounded-xl p-2 bg-slate-900/60 border border-emerald-500/20 shadow-[0_0_40px_rgba(16,185,129,0.15)]">
            <ServiceGraphCanvas graphLayout={graphLayout} />
          </div>
        </div>

        {/* Category cards with live streams */}
        <div className="px-3 py-2 border-b bg-transparent">
          <div className="grid grid-cols-1 md:grid-cols-3 lg:grid-cols-7 gap-2">
            {['AI','Scrapping','HTTP','Database','Realtime','System','Other'].map((cat)=> (
              <div key={cat} className="rounded border border-emerald-500/20 bg-slate-950/60">
                <div className="px-2 py-1 text-[11px] font-semibold text-emerald-300 rounded-t flex items-center justify-between bg-slate-900/60">
                  <span className="flex items-center gap-2">
                    <span>{cat}</span>
                    {cat === 'Scrapping' && scraperLib && (
                      <span className="px-1.5 py-0.5 rounded-full bg-emerald-500/10 text-emerald-300 border border-emerald-500/20 text-[10px]">{scraperLib}</span>
                    )}
                  </span>
                  <div className="flex gap-2 text-[10px] text-emerald-300/70">{cardStats(cat).map((s,i)=>(<span key={i}><span className="uppercase">{s.k}</span>: {s.v??'-'}</span>))}</div>
                </div>
                <div className="max-h-44 overflow-hidden p-1">
                  <VirtualList
                    items={(byCategory[cat]||[]).slice(-200).reverse()}
                    height={176}
                    renderItem={(l, idx) => {
                      const isError = isEntryError(l);
                      const line = (
                        <div className={`text-[11px] ${isError?'text-red-400':'text-emerald-200'} truncate`}>[{new Date(l.ts).toLocaleTimeString()}] {summarize(cat,l)}</div>
                      );
                      if (!isError) return line;
                      return (
                        <details className="open:bg-red-900/20">
                          <summary className="cursor-pointer list-none" onClick={() => copyEntryDetails(l)}>{line}</summary>
                          <div className="flex items-center justify-between mb-1">
                            <button type="button" className="text-[11px] px-2 py-0.5 border rounded bg-slate-900 text-emerald-300 border-emerald-500/30 hover:bg-slate-800" onClick={(e)=>{e.preventDefault(); e.stopPropagation(); copyEntryDetails(l);}}>Copy details</button>
                            {copiedMsg && <span className="text-[10px] text-emerald-300">{copiedMsg}</span>}
                          </div>
                          <pre className="mt-1 bg-slate-900/80 border border-emerald-500/20 rounded p-2 text-[11px] max-h-60 overflow-auto text-emerald-200">{JSON.stringify(l.payload, null, 2)}</pre>
                        </details>
                      );
                    }}
                  />
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* Errors + Activity side-by-side */}
        <div className="px-3 py-2 border-b bg-transparent">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-2">
            <div className="rounded border border-red-500/30 bg-slate-950/60">
              <div className="px-2 py-1 text-[11px] font-semibold bg-red-900/30 text-red-300 rounded-t">Errors</div>
              <div className="max-h-56 overflow-auto p-1">
                {errorEntries.slice(-80).reverse().map((e,idx)=> (
                  <details key={`${e.ts}-${idx}`} className="px-2 py-1 border-b last:border-0 bg-red-900/10 open:bg-red-900/20 border-red-500/20">
                    <summary className="cursor-pointer text-[11px] text-red-300 truncate" onClick={() => copyEntryDetails(e)}>[{new Date(e.ts).toLocaleTimeString()}] [{e.event}/{classify(e)}] {JSON.stringify(e.payload).slice(0,160)}</summary>
                    <div className="flex items-center justify-between mb-1">
                      <button type="button" className="text-[11px] px-2 py-0.5 border rounded bg-slate-900 text-emerald-300 border-emerald-500/30 hover:bg-slate-800" onClick={(ev)=>{ev.preventDefault(); ev.stopPropagation(); copyEntryDetails(e);}}>Copy details</button>
                      {copiedMsg && <span className="text-[10px] text-emerald-300">{copiedMsg}</span>}
                    </div>
                    <pre className="mt-1 bg-slate-900/80 border border-emerald-500/20 rounded p-2 text-[11px] max-h-60 overflow-auto text-emerald-200">{JSON.stringify(e.payload, null, 2)}</pre>
                  </details>
                ))}
                {errorEntries.length===0 && <div className="text-[11px] text-emerald-300/60 italic px-2 py-1">No recent errors</div>}
              </div>
            </div>
            <div className="rounded border border-emerald-500/20 bg-slate-950/60">
              <div className="px-2 py-1 text-[11px] font-semibold bg-slate-900/60 text-emerald-300 rounded-t">Activity Stream</div>
              <div className="max-h-56 overflow-hidden">
                <VirtualList
                  items={activityFeed}
                  height={224}
                  renderItem={(a, idx)=> (
                    <div className={`px-2 py-1 text-[12px] border-b last:border-0 ${a.isError?'text-red-300':'text-emerald-200'} border-emerald-500/10`}>
                      <span className="text-emerald-300/70 mr-2">{new Date(a.ts).toLocaleTimeString()}</span>
                      <span className="text-emerald-400 mr-2">[{a.event}/{a.cat}]</span>
                      <span className="truncate inline-block align-middle max-w-[75%]">{a.text}</span>
                    </div>
                  )}
                />
              </div>
            </div>
          </div>
        </div>

        {/* Bottom spacer */}

        {/* Spacer at bottom to keep layout tidy */}
        <div ref={logEndRef} className="h-2" />
      </div>
    </div>
  );
};

export default LiveDebugOverlay;


// Futuristic Matrix background canvas (GPU-lightweight)
const MatrixBackground = () => {
  const ref = useRef(null);
  useEffect(() => {
    const canvas = ref.current; if (!canvas) return; const ctx = canvas.getContext('2d');
    let raf = 0; let w = canvas.width = window.innerWidth; let h = canvas.height = window.innerHeight;
    const onResize = () => { w = canvas.width = window.innerWidth; h = canvas.height = window.innerHeight; columns = Math.floor(w / 14); drops = Array(columns).fill(0); };
    window.addEventListener('resize', onResize);
    let columns = Math.floor(w / 14);
    let drops = Array(columns).fill(0);
    const chars = '01ABCDEFGHIJKLMNOPQRSTUVXYZ#$%&*+-';
    const draw = () => {
      ctx.fillStyle = 'rgba(2, 6, 23, 0.35)';
      ctx.fillRect(0, 0, w, h);
      ctx.fillStyle = '#10b981';
      ctx.shadowColor = '#10b981';
      ctx.shadowBlur = 8;
      for (let i = 0; i < drops.length; i++) {
        const text = chars[Math.floor(Math.random() * chars.length)];
        const x = i * 14; const y = (drops[i] * 14) % (h + 200);
        ctx.fillText(text, x, y);
        drops[i] = (drops[i] + (Math.random() * 2)) % (h / 14 + 20);
      }
      raf = requestAnimationFrame(draw);
    };
    draw();
    return () => { cancelAnimationFrame(raf); window.removeEventListener('resize', onResize); };
  }, []);
  return <canvas ref={ref} className="absolute inset-0 w-full h-full" style={{ pointerEvents: 'none' }} />;
};

