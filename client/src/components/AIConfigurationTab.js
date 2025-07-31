import React, { useState, useEffect } from 'react';
import { Key, Server, Brain, Settings, Activity, MessageSquare } from 'lucide-react';
import AIDashboard from './AIDashboard';
import axios from 'axios';

const AIConfigurationTab = ({ metrics }) => {
  const [activeSection, setActiveSection] = useState('configuration');
  const [aiProvider, setAiProvider] = useState('openai');
  const [apiKey, setApiKey] = useState('');
  const [ollamaModels, setOllamaModels] = useState([]);
  const [selectedModel, setSelectedModel] = useState('');
  const [customPrompt, setCustomPrompt] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');
  const [ollamaRunning, setOllamaRunning] = useState(false);
  const [testingModel, setTestingModel] = useState(false);
  const [tokenLimits, setTokenLimits] = useState({
    chat: 1000,
    analysis: 800,
    streaming: 1000,
    test: 50
  });

  useEffect(() => {
    loadExistingConfig();
    fetchOllamaModels();
  }, []);

  const loadExistingConfig = async () => {
    try {
      const response = await axios.get('http://localhost:8080/api/ai-config');
      const config = response.data;
      
      if (config.aiProvider) {
        setAiProvider(config.aiProvider);
      }
      if (config.ollamaModel) {
        setSelectedModel(config.ollamaModel);
      }
      if (config.customPrompt) {
        setCustomPrompt(config.customPrompt);
      }
      if (config.tokenLimits) {
        setTokenLimits(config.tokenLimits);
      }
    } catch (error) {
      console.error('Error loading config:', error);
    }
  };

  const fetchOllamaModels = async () => {
    try {
      const response = await axios.get('http://localhost:8080/api/ollama/models');
      if (response.data.success) {
        setOllamaModels(response.data.models);
        setOllamaRunning(true);
        if (response.data.models.length > 0 && !selectedModel) {
          setSelectedModel(response.data.models[0].name);
        }
      } else {
        setOllamaRunning(false);
        setOllamaModels([]);
      }
    } catch (error) {
      console.error('Error fetching Ollama models:', error);
      setOllamaRunning(false);
      setOllamaModels([]);
    }
  };

  const testOllamaModel = async (model) => {
    setTestingModel(true);
    try {
      const response = await axios.post('http://localhost:8080/api/ollama/test', {
        model: model
      });
      
      if (response.data.success) {
        setSuccess(`Model ${model} is working correctly!`);
        setError('');
      } else {
        setError(`Model ${model} test failed: ${response.data.error}`);
        setSuccess('');
      }
    } catch (error) {
      setError(`Error testing model: ${error.message}`);
      setSuccess('');
    } finally {
      setTestingModel(false);
    }
  };

  const handleSaveConfiguration = async () => {
    if (aiProvider === 'openai' && !apiKey.trim()) {
      setError('Please enter your OpenAI API key');
      return;
    }
    
    if (aiProvider === 'ollama' && !selectedModel) {
      setError('Please select an Ollama model');
      return;
    }

    setLoading(true);
    setError('');
    setSuccess('');

    try {
      await axios.post('http://localhost:8080/api/setup', {
        aiProvider,
        apiKey: apiKey.trim(),
        ollamaModel: selectedModel,
        customPrompt: customPrompt.trim() || null,
        tokenLimits
      }, {
        headers: {
          'Content-Type': 'application/json'
        },
        timeout: 15000
      });
      
      setSuccess('Configuration saved successfully!');
    } catch (error) {
      console.error('Setup error:', error);
      
      let errorMessage = 'Failed to save configuration. Please try again.';
      
      if (error.response?.data?.error) {
        errorMessage = error.response.data.error;
      } else if (error.code === 'ECONNABORTED') {
        errorMessage = 'Request timeout. Please check your connection and try again.';
      } else if (error.code === 'NETWORK_ERROR') {
        errorMessage = 'Network error. Please check if the server is running.';
      }
      
      setError(errorMessage);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="space-y-6">
      {/* Section Navigation */}
      <div className="bg-white rounded-lg shadow">
        <div className="border-b border-gray-200">
          <nav className="flex space-x-8 px-6">
            {[
              { id: 'configuration', name: 'Configuration', icon: Settings },
              { id: 'metrics', name: 'Metrics', icon: Activity },
              { id: 'dashboard', name: 'Dashboard', icon: MessageSquare }
            ].map((section) => {
              const Icon = section.icon;
              return (
                <button
                  key={section.id}
                  onClick={() => setActiveSection(section.id)}
                  className={`py-4 px-1 border-b-2 font-medium text-sm flex items-center space-x-2 ${
                    activeSection === section.id
                      ? 'border-blue-500 text-blue-600'
                      : 'border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300'
                  }`}
                >
                  <Icon size={16} />
                  <span>{section.name}</span>
                </button>
              );
            })}
          </nav>
        </div>
      </div>

      {/* Configuration Section */}
      {activeSection === 'configuration' && (
        <div className="bg-white rounded-lg shadow p-6 space-y-6">
          <div className="flex items-center space-x-3 mb-6">
            <div className="inline-flex items-center justify-center w-10 h-10 bg-gradient-to-br from-blue-500 to-purple-600 rounded-lg">
              <Brain size={20} className="text-white" />
            </div>
            <div>
              <h2 className="text-xl font-bold text-gray-900">AI Configuration</h2>
              <p className="text-gray-600">Configure your AI provider and settings</p>
            </div>
          </div>

          {/* AI Provider Selection */}
          <div>
            <label className="block text-sm font-semibold text-gray-700 mb-3">
              AI Provider
            </label>
            <div className="grid grid-cols-2 gap-4">
              <button
                type="button"
                onClick={() => setAiProvider('openai')}
                className={`p-4 border-2 rounded-xl transition-all ${
                  aiProvider === 'openai'
                    ? 'border-blue-500 bg-blue-50 text-blue-700'
                    : 'border-gray-300 hover:border-gray-400'
                }`}
              >
                <Key size={24} className="mx-auto mb-2" />
                <div className="font-semibold">OpenAI</div>
                <div className="text-xs text-gray-500">GPT-4 & GPT-3.5</div>
              </button>
              <button
                type="button"
                onClick={() => setAiProvider('ollama')}
                className={`p-4 border-2 rounded-xl transition-all ${
                  aiProvider === 'ollama'
                    ? 'border-purple-500 bg-purple-50 text-purple-700'
                    : 'border-gray-300 hover:border-gray-400'
                }`}
              >
                <Server size={24} className="mx-auto mb-2" />
                <div className="font-semibold">Ollama</div>
                <div className="text-xs text-gray-500">Local Models</div>
              </button>
            </div>
          </div>

          {/* OpenAI Configuration */}
          {aiProvider === 'openai' && (
            <div>
              <label htmlFor="apiKey" className="block text-sm font-semibold text-gray-700 mb-2">
                OpenAI API Key
              </label>
              <input
                id="apiKey"
                type="password"
                value={apiKey}
                onChange={(e) => setApiKey(e.target.value)}
                placeholder="sk-..."
                className={`w-full px-4 py-3 border rounded-xl focus:ring-2 focus:ring-blue-500 focus:border-blue-500 transition-colors ${
                  error ? 'border-red-500 bg-red-50' : 'border-gray-300'
                }`}
                disabled={loading}
              />
            </div>
          )}

          {/* Ollama Configuration */}
          {aiProvider === 'ollama' && (
            <div>
              <div className="flex items-center justify-between mb-2">
                <label className="block text-sm font-semibold text-gray-700">
                  Ollama Model
                </label>
                <button
                  type="button"
                  onClick={fetchOllamaModels}
                  className="text-sm text-blue-600 hover:text-blue-700"
                >
                  Refresh
                </button>
              </div>
              
              {!ollamaRunning ? (
                <div className="text-sm text-red-600 mb-3 p-3 bg-red-50 rounded-lg">
                  Ollama is not running. Please start Ollama first.
                </div>
              ) : ollamaModels.length === 0 ? (
                <div className="text-sm text-yellow-600 mb-3 p-3 bg-yellow-50 rounded-lg">
                  No models found. Please install models using: ollama pull llama2
                </div>
              ) : (
                <div className="space-y-2">
                  <select
                    value={selectedModel}
                    onChange={(e) => setSelectedModel(e.target.value)}
                    className="w-full px-4 py-3 border border-gray-300 rounded-xl focus:ring-2 focus:ring-purple-500 focus:border-purple-500"
                    disabled={loading}
                  >
                    <option value="">Select a model...</option>
                    {ollamaModels.map((model) => (
                      <option key={model.name} value={model.name}>
                        {model.name} ({(model.size / 1e9).toFixed(1)}GB)
                      </option>
                    ))}
                  </select>
                  
                  {selectedModel && (
                    <button
                      type="button"
                      onClick={() => testOllamaModel(selectedModel)}
                      disabled={testingModel}
                      className="text-sm text-purple-600 hover:text-purple-700 disabled:opacity-50"
                    >
                      {testingModel ? 'Testing...' : 'Test Model'}
                    </button>
                  )}
                </div>
              )}
            </div>
          )}

          {/* Custom Prompt */}
          <div>
            <label htmlFor="customPrompt" className="block text-sm font-semibold text-gray-700 mb-2">
              Custom Analysis Prompt (Optional)
            </label>
            <textarea
              id="customPrompt"
              value={customPrompt}
              onChange={(e) => setCustomPrompt(e.target.value)}
              placeholder="Enter your custom prompt for financial analysis..."
              rows={4}
              className="w-full px-4 py-3 border border-gray-300 rounded-xl focus:ring-2 focus:ring-blue-500 focus:border-blue-500 transition-colors resize-none"
              disabled={loading}
            />
            <div className="text-xs text-gray-500 mt-1">
              Leave empty to use the default financial analysis prompt
            </div>
          </div>

          {/* Token Configuration */}
          <div className="space-y-4 bg-gray-50 p-4 rounded-xl">
            <h3 className="text-sm font-semibold text-gray-700 mb-3">Token Limits Configuration</h3>
            
            <div className="grid grid-cols-2 gap-4">
              <div>
                <label htmlFor="chatTokens" className="block text-xs font-medium text-gray-600 mb-1">
                  Chat Responses
                </label>
                <input
                  type="number"
                  id="chatTokens"
                  value={tokenLimits.chat}
                  onChange={(e) => setTokenLimits(prev => ({...prev, chat: parseInt(e.target.value) || 1000}))}
                  min="100"
                  max="4000"
                  className="w-full px-3 py-2 text-sm border border-gray-300 rounded-lg focus:ring-1 focus:ring-blue-500 focus:border-blue-500"
                  disabled={loading}
                />
              </div>
              
              <div>
                <label htmlFor="analysisTokens" className="block text-xs font-medium text-gray-600 mb-1">
                  News Analysis
                </label>
                <input
                  type="number"
                  id="analysisTokens"
                  value={tokenLimits.analysis}
                  onChange={(e) => setTokenLimits(prev => ({...prev, analysis: parseInt(e.target.value) || 800}))}
                  min="200"
                  max="2000"
                  className="w-full px-3 py-2 text-sm border border-gray-300 rounded-lg focus:ring-1 focus:ring-blue-500 focus:border-blue-500"
                  disabled={loading}
                />
              </div>
              
              <div>
                <label htmlFor="streamingTokens" className="block text-xs font-medium text-gray-600 mb-1">
                  Streaming Chat
                </label>
                <input
                  type="number"
                  id="streamingTokens"
                  value={tokenLimits.streaming}
                  onChange={(e) => setTokenLimits(prev => ({...prev, streaming: parseInt(e.target.value) || 1000}))}
                  min="100"
                  max="4000"
                  className="w-full px-3 py-2 text-sm border border-gray-300 rounded-lg focus:ring-1 focus:ring-blue-500 focus:border-blue-500"
                  disabled={loading}
                />
              </div>
              
              <div>
                <label htmlFor="testTokens" className="block text-xs font-medium text-gray-600 mb-1">
                  Model Test
                </label>
                <input
                  type="number"
                  id="testTokens"
                  value={tokenLimits.test}
                  onChange={(e) => setTokenLimits(prev => ({...prev, test: parseInt(e.target.value) || 50}))}
                  min="5"
                  max="200"
                  className="w-full px-3 py-2 text-sm border border-gray-300 rounded-lg focus:ring-1 focus:ring-blue-500 focus:border-blue-500"
                  disabled={loading}
                />
              </div>
            </div>
            
            <p className="text-xs text-gray-500">
              Configure token limits for different AI tasks. Higher values allow longer responses but take more time and resources.
            </p>
          </div>

          {/* Status Messages */}
          {error && (
            <div className="flex items-center gap-2 text-red-600 text-sm p-3 bg-red-50 rounded-lg border border-red-200">
              <svg className="w-4 h-4 flex-shrink-0" fill="currentColor" viewBox="0 0 20 20">
                <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zM8.707 7.293a1 1 0 00-1.414 1.414L8.586 10l-1.293 1.293a1 1 0 101.414 1.414L10 11.414l1.293 1.293a1 1 0 001.414-1.414L11.414 10l1.293-1.293a1 1 0 00-1.414-1.414L10 8.586 8.707 7.293z" clipRule="evenodd" />
              </svg>
              <span>{error}</span>
            </div>
          )}

          {success && (
            <div className="flex items-center gap-2 text-green-600 text-sm p-3 bg-green-50 rounded-lg border border-green-200">
              <svg className="w-4 h-4 flex-shrink-0" fill="currentColor" viewBox="0 0 20 20">
                <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zm3.707-9.293a1 1 0 00-1.414-1.414L9 10.586 7.707 9.293a1 1 0 00-1.414 1.414l2 2a1 1 0 001.414 0l4-4z" clipRule="evenodd" />
              </svg>
              <span>{success}</span>
            </div>
          )}

          {/* Save Button */}
          <button 
            onClick={handleSaveConfiguration}
            className="w-full py-3 px-4 bg-gradient-to-r from-blue-500 to-purple-600 hover:from-blue-600 hover:to-purple-700 text-white font-semibold rounded-xl transition-all duration-300 hover:shadow-lg hover:shadow-blue-500/25 disabled:opacity-50 disabled:cursor-not-allowed"
            disabled={loading || (aiProvider === 'openai' && !apiKey.trim()) || (aiProvider === 'ollama' && !selectedModel)}
          >
            {loading ? (
              <div className="flex items-center justify-center gap-2">
                <div className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin"></div>
                Saving Configuration...
              </div>
            ) : (
              'Save Configuration'
            )}
          </button>
        </div>
      )}

      {/* Metrics Section */}
      {activeSection === 'metrics' && (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          <div className="bg-white rounded-lg shadow p-6">
            <h3 className="text-lg font-semibold text-gray-900 mb-4">AI Request Stats</h3>
            <div className="space-y-3">
              <div className="flex justify-between">
                <span className="text-gray-600">Total Requests</span>
                <span className="font-medium">{metrics?.ai?.requests?.total || 0}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-gray-600">Active Requests</span>
                <span className="font-medium text-blue-500">{metrics?.ai?.requests?.active || 0}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-gray-600">Request Errors</span>
                <span className="font-medium text-red-500">{metrics?.ai?.requests?.errors || 0}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-gray-600">Avg Response Time</span>
                <span className="font-medium">{Math.round(metrics?.ai?.avgResponseTime || 0)}ms</span>
              </div>
            </div>
          </div>

          <div className="bg-white rounded-lg shadow p-6">
            <h3 className="text-lg font-semibold text-gray-900 mb-4">Token Usage</h3>
            <div className="space-y-3">
              <div className="flex justify-between">
                <span className="text-gray-600">Tokens Used</span>
                <span className="font-medium">{metrics?.ai?.tokens?.used?.toLocaleString() || 0}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-gray-600">Estimated Cost</span>
                <span className="font-medium">${(metrics?.ai?.tokens?.cost || 0).toFixed(4)}</span>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Dashboard Section */}
      {activeSection === 'dashboard' && (
        <div className="bg-white rounded-lg shadow-lg">
          <AIDashboard onClose={() => {}} integrated={true} />
        </div>
      )}
    </div>
  );
};

export default AIConfigurationTab;