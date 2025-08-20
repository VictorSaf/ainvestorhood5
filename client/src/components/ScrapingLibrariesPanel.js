import React, { useEffect, useState } from 'react';
import axios from 'axios';

const ScrapingLibrariesPanel = () => {
  const [libs, setLibs] = useState([]);
  const [testingKey, setTestingKey] = useState('');
  const [results, setResults] = useState({});
  const [usingKey, setUsingKey] = useState('');
  const [error, setError] = useState('');
  const [intervalSec, setIntervalSec] = useState('');
  const [saving, setSaving] = useState(false);

  const load = async () => {
    try {
      const res = await axios.get('http://localhost:8080/api/scraping/libs');
      setLibs(res.data.libs || []);
      const cfg = await axios.get('http://localhost:8080/api/scraping/config');
      setIntervalSec(String(cfg.data.intervalSec || 30));
    } catch (e) {
      setError(e.response?.data?.error || e.message);
    }
  };

  useEffect(() => { load(); }, []);

  const runTest = async (key) => {
    setTestingKey(key);
    setError('');
    try {
      try { window.dispatchEvent(new CustomEvent('scraping-test-result', { detail: { key, result: { clearing: true, bySource: [] } } })); } catch {}
      const res = await axios.post('http://localhost:8080/api/scraping/test', { key }, { headers: { 'Content-Type': 'application/json' } });
      const data = res.data;
      setResults(prev => ({ ...prev, [key]: { success: !!data.success, articles: data.articles, durationMs: data.durationMs, at: new Date().toLocaleTimeString(), bySource: data.bySource || [] } }));
      try { window.dispatchEvent(new CustomEvent('scraping-test-result', { detail: { key, result: data } })); } catch {}
    } catch (e) {
      setResults(prev => ({ ...prev, [key]: { success: false, error: e.response?.data?.error || e.message, at: new Date().toLocaleTimeString() } }));
    } finally {
      setTestingKey('');
    }
  };

  const activateLibrary = async (key) => {
    setUsingKey(key);
    setError('');
    try {
      await axios.post('http://localhost:8080/api/scraping/use', { key }, { headers: { 'Content-Type': 'application/json' } });
      // Optional immediate feedback reload
      await load();
    } catch (e) {
      setError(e.response?.data?.error || e.message);
    } finally {
      setUsingKey('');
    }
  };

  const saveInterval = async () => {
    setSaving(true);
    setError('');
    try {
      const val = parseInt(intervalSec, 10);
      await axios.post('http://localhost:8080/api/scraping/config', { intervalSec: val }, { headers: { 'Content-Type': 'application/json' } });
      await load();
    } catch (e) {
      setError(e.response?.data?.error || e.message);
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="space-y-4">
      {error && <div className="text-sm text-red-600">{error}</div>}
      {libs.length === 0 ? (
        <div className="text-gray-500 text-sm">No libraries detected</div>
      ) : (
        <div className="space-y-3">
          <div className="border rounded-lg p-4">
            <div className="font-semibold mb-2">Scrapping Interval</div>
            <div className="flex items-center gap-3">
              <input type="number" className="border rounded px-3 py-1 w-28" value={intervalSec}
                     onChange={(e)=>setIntervalSec(e.target.value)} placeholder="e.g. 30" />
              <span className="text-sm text-gray-600">seconds</span>
              <button onClick={saveInterval} disabled={saving} className="px-3 py-1 rounded bg-blue-600 text-white text-sm disabled:opacity-50">
                {saving ? 'Saving...' : 'Save'}
              </button>
            </div>
          </div>
          {libs.map((lib) => (
            <div key={lib.key} className="border rounded-lg p-4">
              <div className="flex items-center justify-between">
                <div>
                  <div className="font-semibold">{lib.name}</div>
                </div>
                <div className="flex gap-2">
                  <button onClick={() => runTest(lib.key)} disabled={testingKey===lib.key} className="px-3 py-1 rounded bg-blue-600 text-white text-sm disabled:opacity-50">
                    {testingKey===lib.key ? 'Testing...' : 'Run Test'}
                  </button>
                  <button onClick={() => activateLibrary(lib.key)} disabled={usingKey===lib.key || lib.active} className="px-3 py-1 rounded bg-green-600 text-white text-sm disabled:opacity-50">
                    {lib.active ? 'In Use' : (usingKey===lib.key ? 'Applying...' : 'Use')}
                  </button>
                </div>
              </div>
              {results[lib.key] && (
                <div className="mt-3 text-sm">
                  {results[lib.key].success ? (
                    <div className="text-gray-700 mb-2">Found {results[lib.key].articles} articles in {results[lib.key].durationMs} ms (at {results[lib.key].at})</div>
                  ) : (
                    <div className="text-red-600 mb-2">Test failed: {results[lib.key].error} (at {results[lib.key].at})</div>
                  )}
                </div>
              )}
            </div>
          ))}
        </div>
      )}

      {/* Sources list removed as requested */}
    </div>
  );
};

export default ScrapingLibrariesPanel;


