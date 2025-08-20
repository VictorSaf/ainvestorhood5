import React, { useEffect, useState } from 'react';

const ScrapingPanel = () => {
  const [libs, setLibs] = useState([]);
  const [testing, setTesting] = useState(false);
  const [lastResult, setLastResult] = useState(null);

  const load = async () => {
    try {
      const res = await fetch('http://localhost:8080/api/scraping/libs');
      const data = await res.json();
      setLibs(data.libs || []);
    } catch {}
  };

  useEffect(() => {
    load();
  }, []);

  useEffect(() => {
    const handler = () => load();
    window.addEventListener('openScrapingTab', handler);
    return () => window.removeEventListener('openScrapingTab', handler);
  }, []);

  const runTest = async () => {
    setTesting(true);
    try {
      const res = await fetch('http://localhost:8080/api/scraping/test', { method: 'POST' });
      const data = await res.json();
      setLastResult(data);
    } finally {
      setTesting(false);
    }
  };

  return (
    <div className="mt-6 p-4 border rounded-xl bg-gray-50">
      <h3 className="font-semibold text-gray-800 mb-3">Scraping Libraries</h3>
      {libs.length === 0 ? (
        <div className="text-sm text-gray-500">No libraries detected</div>
      ) : (
        <div className="space-y-2">
          {libs.map((lib) => (
            <div key={lib.key} className="flex items-center justify-between text-sm">
              <div>
                <div className="font-medium">{lib.name}</div>
                <div className="text-gray-500">Interval: {lib.intervalSec}s</div>
              </div>
              <button onClick={runTest} disabled={testing}
                className="px-3 py-1 rounded bg-blue-600 text-white disabled:opacity-50">
                {testing ? 'Testing...' : 'Run Test'}
              </button>
            </div>
          ))}
        </div>
      )}
      {lastResult && (
        <div className="mt-3 text-xs text-gray-600">
          Result: {lastResult.success ? 'OK' : 'Error'} | Articles: {lastResult.articles || 0} | Duration: {Math.round((lastResult.durationMs||0)/1000)}s
        </div>
      )}
    </div>
  );
};

export default ScrapingPanel;


