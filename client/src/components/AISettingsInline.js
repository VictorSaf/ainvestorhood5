import React, { useEffect, useState } from 'react';
import axios from 'axios';

const AISettingsInline = () => {
  const [aiProvider, setAiProvider] = useState('openai');
  const [apiKey, setApiKey] = useState('');
  const [ollamaModels, setOllamaModels] = useState([]);
  const [selectedModel, setSelectedModel] = useState('');
  const [customPrompt, setCustomPrompt] = useState('');
  const [analysisTokens, setAnalysisTokens] = useState(160);
  const [chatTokens, setChatTokens] = useState(64);
  const [minIntervalSec, setMinIntervalSec] = useState(30);
  const [testing, setTesting] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    (async () => {
      try {
        const cfg = await axios.get('http://localhost:8080/api/ai-config');
        setAiProvider(cfg.data.aiProvider || 'openai');
        if (cfg.data.ollamaModel) setSelectedModel(cfg.data.ollamaModel);
        if (cfg.data.customPrompt) setCustomPrompt(cfg.data.customPrompt);
      } catch {}
      try {
        const res = await axios.get('http://localhost:8080/api/ai-settings');
        if (res.data.analysisTokens) setAnalysisTokens(res.data.analysisTokens);
        if (res.data.chatTokens) setChatTokens(res.data.chatTokens);
        if (res.data.minIntervalSec) setMinIntervalSec(res.data.minIntervalSec);
      } catch {}
      try {
        const models = await axios.get('http://localhost:8080/api/ollama/models');
        if (models.data.success) setOllamaModels(models.data.models);
      } catch {}
    })();
  }, []);

  const testModel = async () => {
    if (!selectedModel) return;
    setTesting(true);
    try {
      await axios.post('http://localhost:8080/api/ollama/test', { model: selectedModel });
      alert('Model test succeeded');
    } catch (e) {
      alert('Model test failed: ' + (e.response?.data?.error || e.message));
    } finally {
      setTesting(false);
    }
  };

  const save = async () => {
    setSaving(true);
    setError('');
    try {
      await axios.post('http://localhost:8080/api/setup', {
        aiProvider,
        apiKey: apiKey.trim(),
        ollamaModel: selectedModel,
        customPrompt: customPrompt.trim() || null
      }, { headers: { 'Content-Type': 'application/json' } });

      await axios.post('http://localhost:8080/api/ai-settings', {
        analysisTokens: Number(analysisTokens),
        chatTokens: Number(chatTokens),
        minIntervalSec: Number(minIntervalSec)
      }, { headers: { 'Content-Type': 'application/json' } });
    } catch (e) {
      setError(e.response?.data?.error || e.message);
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="mt-6 border rounded-xl p-4">
      <h3 className="text-lg font-semibold text-gray-900 mb-4">AI Settings</h3>
      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        <div>
          <label className="block text-sm font-semibold text-gray-700 mb-2">AI Provider</label>
          <div className="flex gap-3">
            <button type="button" onClick={()=>setAiProvider('openai')} className={`px-3 py-2 rounded border ${aiProvider==='openai'?'border-blue-500 text-blue-600 bg-blue-50':'border-gray-300'}`}>OpenAI</button>
            <button type="button" onClick={()=>setAiProvider('ollama')} className={`px-3 py-2 rounded border ${aiProvider==='ollama'?'border-purple-500 text-purple-700 bg-purple-50':'border-gray-300'}`}>Ollama</button>
          </div>
        </div>
        {aiProvider==='openai' && (
          <div>
            <label className="block text-sm font-semibold text-gray-700 mb-2">OpenAI API Key</label>
            <input type="password" className="w-full px-3 py-2 rounded border" value={apiKey} onChange={e=>setApiKey(e.target.value)} placeholder="sk-..." />
          </div>
        )}
        {aiProvider==='ollama' && (
          <div>
            <label className="block text-sm font-semibold text-gray-700 mb-2">Ollama Model</label>
            <div className="flex gap-3 items-center">
              <select className="px-3 py-2 rounded border w-full" value={selectedModel} onChange={e=>setSelectedModel(e.target.value)}>
                <option value="">Select model...</option>
                {ollamaModels.map(m=> (
                  <option key={m.name} value={m.name}>{m.name}</option>
                ))}
              </select>
              <button type="button" onClick={testModel} disabled={testing} className="px-3 py-2 rounded bg-purple-600 text-white disabled:opacity-50">{testing?'Testing...':'Test'}</button>
            </div>
          </div>
        )}
        <div className="md:col-span-2">
          <label className="block text-sm font-semibold text-gray-700 mb-2">Custom Prompt (optional)</label>
          <textarea rows={3} className="w-full px-3 py-2 rounded border" value={customPrompt} onChange={e=>setCustomPrompt(e.target.value)} />
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mt-4">
        <div>
          <label className="block text-sm font-semibold text-gray-700 mb-1">Tokens per Analysis</label>
          <input type="number" min={32} className="w-full px-3 py-2 rounded border" value={analysisTokens} onChange={e=>setAnalysisTokens(e.target.value)} />
        </div>
        <div>
          <label className="block text-sm font-semibold text-gray-700 mb-1">Tokens for Chat/Test</label>
          <input type="number" min={16} className="w-full px-3 py-2 rounded border" value={chatTokens} onChange={e=>setChatTokens(e.target.value)} />
        </div>
        <div>
          <label className="block text-sm font-semibold text-gray-700 mb-1">AI Analysis Interval (sec)</label>
          <input type="number" min={1} className="w-full px-3 py-2 rounded border" value={minIntervalSec} onChange={e=>setMinIntervalSec(e.target.value)} />
        </div>
      </div>

      {error && <div className="mt-3 text-sm text-red-600">{error}</div>}

      <div className="mt-4">
        <button onClick={save} disabled={saving} className="px-4 py-2 rounded bg-blue-600 text-white disabled:opacity-50">{saving?'Saving...':'Save Settings'}</button>
      </div>
    </div>
  );
};

export default AISettingsInline;


