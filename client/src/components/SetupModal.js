import React, { useState, useEffect } from 'react';
import { Key, AlertCircle, CheckCircle, Brain, Server } from 'lucide-react';
import axios from 'axios';

const SetupModal = ({ onComplete }) => {
  const [aiProvider, setAiProvider] = useState('openai');
  const [apiKey, setApiKey] = useState('');
  const [ollamaModels, setOllamaModels] = useState([]);
  const [selectedModel, setSelectedModel] = useState('');
  const [customPrompt, setCustomPrompt] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [ollamaRunning, setOllamaRunning] = useState(false);
  const [testingModel, setTestingModel] = useState(false);

  useEffect(() => {
    fetchOllamaModels();
    loadExistingConfig();
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
        alert(`Model ${model} is working correctly!`);
      } else {
        alert(`Model ${model} test failed: ${response.data.error}`);
      }
    } catch (error) {
      alert(`Error testing model: ${error.message}`);
    } finally {
      setTestingModel(false);
    }
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    
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

    try {
      console.log('📤 Sending AI configuration to server...', {
        aiProvider,
        selectedModel,
        hasCustomPrompt: !!customPrompt.trim()
      });
      
      const response = await axios.post('http://localhost:8080/api/setup', {
        aiProvider,
        apiKey: apiKey.trim(),
        ollamaModel: selectedModel,
        customPrompt: customPrompt.trim() || null
      }, {
        headers: {
          'Content-Type': 'application/json'
        },
        timeout: 15000
      });
      
      console.log('✅ Server response:', response.data);
      console.log('✅ Setup completed successfully!');
      onComplete();
    } catch (error) {
      console.error('❌ Setup error:', error);
      
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
    <div className="fixed inset-0 bg-black/50 backdrop-blur-sm flex items-center justify-center p-4 z-50">
      <div className="bg-white rounded-2xl shadow-2xl max-w-2xl w-full p-8 transform animate-fade-in max-h-[90vh] overflow-y-auto">
        <div className="text-center mb-8">
          <div className="inline-flex items-center justify-center w-16 h-16 bg-gradient-to-br from-blue-500 to-purple-600 rounded-2xl mb-4">
            <Brain size={32} className="text-white" />
          </div>
          <h1 className="text-2xl font-bold text-gray-900 mb-2">Welcome to AIInvestorHood</h1>
          <p className="text-gray-600 leading-relaxed">
            Choose your AI provider and configure financial news analysis.
          </p>
        </div>

        <form onSubmit={handleSubmit} className="space-y-6">
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

          {error && (
            <div className="flex items-center gap-2 text-red-600 text-sm p-3 bg-red-50 rounded-lg">
              <AlertCircle size={16} />
              <span>{error}</span>
            </div>
          )}

          <div className="space-y-3">
            <div className="flex items-center gap-3 text-sm text-gray-600">
              <CheckCircle size={16} className="text-emerald-500 flex-shrink-0" />
              <span>Configuration is stored securely on your device</span>
            </div>
            <div className="flex items-center gap-3 text-sm text-gray-600">
              <CheckCircle size={16} className="text-emerald-500 flex-shrink-0" />
              <span>AI analyzes financial news every 2 minutes</span>
            </div>
            <div className="flex items-center gap-3 text-sm text-gray-600">
              <CheckCircle size={16} className="text-emerald-500 flex-shrink-0" />
              <span>Get buy/sell recommendations with confidence scores</span>
            </div>
          </div>

          <button 
            type="submit" 
            className="w-full py-3 px-4 bg-gradient-to-r from-blue-500 to-purple-600 hover:from-blue-600 hover:to-purple-700 text-white font-semibold rounded-xl transition-all duration-300 hover:shadow-lg hover:shadow-blue-500/25 disabled:opacity-50 disabled:cursor-not-allowed"
            disabled={loading || (aiProvider === 'openai' && !apiKey.trim()) || (aiProvider === 'ollama' && !selectedModel)}
          >
            {loading ? (
              <div className="flex items-center justify-center gap-2">
                <div className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin"></div>
                Setting up...
              </div>
            ) : (
              'Start Analyzing News'
            )}
          </button>
        </form>

        {aiProvider === 'openai' && (
          <div className="mt-6 text-center text-sm text-gray-500">
            <p>
              <strong>Need an API key?</strong> Get one from{' '}
              <a 
                href="https://platform.openai.com/api-keys" 
                target="_blank" 
                rel="noopener noreferrer"
                className="text-blue-600 hover:text-blue-700 font-medium"
              >
                OpenAI Platform
              </a>
            </p>
          </div>
        )}

        {aiProvider === 'ollama' && (
          <div className="mt-6 text-center text-sm text-gray-500">
            <p>
              <strong>Need Ollama?</strong> Download from{' '}
              <a 
                href="https://ollama.ai" 
                target="_blank" 
                rel="noopener noreferrer"
                className="text-purple-600 hover:text-purple-700 font-medium"
              >
                ollama.ai
              </a>
            </p>
          </div>
        )}
      </div>
    </div>
  );
};

export default SetupModal;