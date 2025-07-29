import React, { useState, useEffect, useRef } from 'react';
import axios from 'axios';

const AIDashboard = ({ onClose }) => {
  const [aiConfig, setAiConfig] = useState(null);
  const [ollamaModels, setOllamaModels] = useState([]);
  const [modelDetails, setModelDetails] = useState(null);
  const [chatMessages, setChatMessages] = useState([]);
  const [inputMessage, setInputMessage] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [modelMetrics, setModelMetrics] = useState(null);
  const [testResult, setTestResult] = useState(null);
  const chatEndRef = useRef(null);

  useEffect(() => {
    loadAIConfig();
    loadOllamaModels();
    loadModelMetrics();
  }, []);

  useEffect(() => {
    scrollToBottom();
  }, [chatMessages]);

  const scrollToBottom = () => {
    chatEndRef.current?.scrollIntoView({ behavior: "smooth" });
  };

  const loadAIConfig = async () => {
    try {
      const response = await axios.get('http://localhost:8080/api/ai-config');
      setAiConfig(response.data);
      
      if (response.data.aiProvider === 'ollama' && response.data.ollamaModel) {
        loadModelDetails(response.data.ollamaModel);
      }
    } catch (error) {
      console.error('Error loading AI config:', error);
    }
  };

  const loadOllamaModels = async () => {
    try {
      const response = await axios.get('http://localhost:8080/api/ollama/models');
      if (response.data.success) {
        setOllamaModels(response.data.models);
      }
    } catch (error) {
      console.error('Error loading Ollama models:', error);
    }
  };

  const loadModelDetails = async (modelName) => {
    try {
      const response = await axios.post('http://localhost:8080/api/ollama/model-details', {
        model: modelName
      });
      if (response.data.success) {
        setModelDetails(response.data.details);
      }
    } catch (error) {
      console.error('Error loading model details:', error);
    }
  };

  const loadModelMetrics = async () => {
    try {
      const response = await axios.get('http://localhost:8080/api/ai-metrics');
      setModelMetrics(response.data);
    } catch (error) {
      console.error('Error loading model metrics:', error);
    }
  };

  const testModel = async () => {
    if (!aiConfig) return;
    
    setIsLoading(true);
    try {
      let response;
      if (aiConfig.aiProvider === 'ollama') {
        response = await axios.post('http://localhost:8080/api/ollama/test', {
          model: aiConfig.ollamaModel
        });
      } else {
        response = await axios.post('http://localhost:8080/api/openai/test');
      }
      setTestResult(response.data);
    } catch (error) {
      setTestResult({ success: false, error: error.message });
    } finally {
      setIsLoading(false);
    }
  };

  const sendChatMessage = async () => {
    if (!inputMessage.trim() || !aiConfig) return;

    const userMessage = { role: 'user', content: inputMessage, timestamp: new Date() };
    setChatMessages(prev => [...prev, userMessage]);
    setInputMessage('');
    setIsLoading(true);

    try {
      const response = await axios.post('http://localhost:8080/api/ai-chat', {
        message: inputMessage,
        aiProvider: aiConfig.aiProvider,
        model: aiConfig.ollamaModel,
        customPrompt: aiConfig.customPrompt
      }, {
        timeout: 90000  // 90 seconds timeout for chat requests
      });

      const aiMessage = {
        role: 'assistant',
        content: response.data.response,
        timestamp: new Date(),
        processingTime: response.data.processingTime,
        tokens: response.data.tokens
      };

      setChatMessages(prev => [...prev, aiMessage]);
    } catch (error) {
      const errorMessage = {
        role: 'assistant',
        content: `Error: ${error.message}`,
        timestamp: new Date(),
        isError: true
      };
      setChatMessages(prev => [...prev, errorMessage]);
    } finally {
      setIsLoading(false);
    }
  };

  const clearChat = () => {
    setChatMessages([]);
  };

  const getModelIcon = (provider) => {
    if (provider === 'ollama') {
      return (
        <svg className="w-8 h-8 text-blue-600" fill="currentColor" viewBox="0 0 24 24">
          <path d="M12 2L2 7l10 5 10-5-10-5zM2 17l10 5 10-5M2 12l10 5 10-5"/>
        </svg>
      );
    } else {
      return (
        <svg className="w-8 h-8 text-green-600" fill="currentColor" viewBox="0 0 24 24">
          <path d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm-2 15l-5-5 1.41-1.41L10 14.17l7.59-7.59L19 8l-9 9z"/>
        </svg>
      );
    }
  };

  const formatBytes = (bytes) => {
    if (bytes === 0) return '0 Bytes';
    const k = 1024;
    const sizes = ['Bytes', 'KB', 'MB', 'GB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
  };

  if (!aiConfig) {
    return (
      <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
        <div className="bg-white rounded-lg p-6">
          <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600 mx-auto"></div>
          <p className="mt-2 text-gray-600">Loading AI configuration...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
      <div className="bg-white rounded-xl shadow-2xl w-full max-w-6xl h-full max-h-[90vh] flex flex-col">
        {/* Header */}
        <div className="flex justify-between items-center p-6 border-b border-gray-200">
          <div className="flex items-center space-x-3">
            {getModelIcon(aiConfig.aiProvider)}
            <div>
              <h2 className="text-2xl font-bold text-gray-800">AI Dashboard</h2>
              <p className="text-sm text-gray-600">
                {aiConfig.aiProvider === 'ollama' ? 'Local Ollama Model' : 'OpenAI GPT-4'}
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="text-gray-400 hover:text-gray-600 transition-colors"
          >
            <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>

        <div className="flex-1 flex overflow-hidden">
          {/* Left Panel - Model Details & Settings */}
          <div className="w-1/2 p-6 border-r border-gray-200 overflow-y-auto">
            {/* Model Information */}
            <div className="bg-gradient-to-r from-blue-50 to-indigo-50 rounded-lg p-4 mb-6">
              <h3 className="text-lg font-semibold text-gray-800 mb-3">Model Information</h3>
              
              {aiConfig.aiProvider === 'ollama' ? (
                <div className="space-y-3">
                  <div className="grid grid-cols-2 gap-4">
                    <div>
                      <p className="text-sm text-gray-600">Provider</p>
                      <p className="font-medium text-blue-600">Ollama (Local)</p>
                    </div>
                    <div>
                      <p className="text-sm text-gray-600">Model</p>
                      <p className="font-medium">{aiConfig.ollamaModel}</p>
                    </div>
                  </div>
                  
                  {ollamaModels.length > 0 && (
                    <div>
                      <p className="text-sm text-gray-600">Available Models</p>
                      <div className="mt-1 space-y-1">
                        {ollamaModels.map((model, index) => (
                          <div key={index} className="text-sm bg-white rounded px-2 py-1 flex justify-between">
                            <span className="font-medium">{model.name}</span>
                            <span className="text-gray-500">{formatBytes(model.size)}</span>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}
                </div>
              ) : (
                <div className="space-y-3">
                  <div className="grid grid-cols-2 gap-4">
                    <div>
                      <p className="text-sm text-gray-600">Provider</p>
                      <p className="font-medium text-green-600">OpenAI</p>
                    </div>
                    <div>
                      <p className="text-sm text-gray-600">Model</p>
                      <p className="font-medium">GPT-4</p>
                    </div>
                  </div>
                  <div>
                    <p className="text-sm text-gray-600">API Key Status</p>
                    <p className="font-medium text-green-600">
                      {aiConfig.hasOpenAIKey ? 'Configured ✓' : 'Not configured ✗'}
                    </p>
                  </div>
                </div>
              )}
            </div>

            {/* Agent Settings */}
            <div className="bg-gradient-to-r from-purple-50 to-pink-50 rounded-lg p-4 mb-6">
              <h3 className="text-lg font-semibold text-gray-800 mb-3">Agent Settings</h3>
              
              <div className="space-y-3">
                <div>
                  <p className="text-sm text-gray-600">Custom Prompt</p>
                  <div className="mt-1 bg-white rounded border p-2 max-h-32 overflow-y-auto">
                    <p className="text-sm text-gray-800">
                      {aiConfig.customPrompt || 'Using default financial analysis prompt'}
                    </p>
                  </div>
                </div>
                
                {modelMetrics && (
                  <div className="grid grid-cols-2 gap-4 mt-4">
                    <div>
                      <p className="text-sm text-gray-600">Total Requests</p>
                      <p className="text-lg font-bold text-purple-600">{modelMetrics.totalRequests}</p>
                    </div>
                    <div>
                      <p className="text-sm text-gray-600">Avg Response Time</p>
                      <p className="text-lg font-bold text-purple-600">{modelMetrics.avgResponseTime}ms</p>
                    </div>
                  </div>
                )}
              </div>
            </div>

            {/* Model Test */}
            <div className="bg-gradient-to-r from-green-50 to-emerald-50 rounded-lg p-4">
              <h3 className="text-lg font-semibold text-gray-800 mb-3">Model Test</h3>
              
              <button
                onClick={testModel}
                disabled={isLoading}
                className="w-full bg-green-600 hover:bg-green-700 disabled:bg-gray-400 text-white px-4 py-2 rounded-lg transition-colors mb-3"
              >
                {isLoading ? 'Testing...' : 'Test Model'}
              </button>

              {testResult && (
                <div className={`p-3 rounded-lg ${testResult.success ? 'bg-green-100 border border-green-300' : 'bg-red-100 border border-red-300'}`}>
                  <p className={`text-sm font-medium ${testResult.success ? 'text-green-800' : 'text-red-800'}`}>
                    {testResult.success ? 'Model Test Successful ✓' : 'Model Test Failed ✗'}
                  </p>
                  {testResult.response && (
                    <p className="text-sm text-gray-700 mt-1">{testResult.response}</p>
                  )}
                  {testResult.error && (
                    <p className="text-sm text-red-700 mt-1">{testResult.error}</p>
                  )}
                </div>
              )}
            </div>
          </div>

          {/* Right Panel - Chat Interface */}
          <div className="w-1/2 flex flex-col">
            {/* Chat Header */}
            <div className="p-4 border-b border-gray-200 flex justify-between items-center">
              <h3 className="text-lg font-semibold text-gray-800">Agent Chat Test</h3>
              <button
                onClick={clearChat}
                className="text-gray-500 hover:text-gray-700 text-sm"
              >
                Clear Chat
              </button>
            </div>

            {/* Chat Messages */}
            <div className="flex-1 overflow-y-auto p-4 space-y-4">
              {chatMessages.length === 0 ? (
                <div className="text-center text-gray-500 mt-8">
                  <svg className="w-12 h-12 mx-auto mb-4 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 12h.01M12 12h.01M16 12h.01M21 12c0 4.418-4.03 8-9 8a9.863 9.863 0 01-4.255-.949L3 20l1.395-3.72C3.512 15.042 3 13.574 3 12c0-4.418 4.03-8 9-8s9 3.582 9 8z" />
                  </svg>
                  <p>Start a conversation to test the AI agent</p>
                </div>
              ) : (
                chatMessages.map((message, index) => (
                  <div key={index} className={`flex ${message.role === 'user' ? 'justify-end' : 'justify-start'}`}>
                    <div className={`max-w-xs lg:max-w-md px-4 py-2 rounded-lg ${
                      message.role === 'user' 
                        ? 'bg-blue-600 text-white' 
                        : message.isError 
                          ? 'bg-red-100 text-red-800 border border-red-300'
                          : 'bg-gray-100 text-gray-800'
                    }`}>
                      <p className="text-sm">{message.content}</p>
                      <div className="flex justify-between items-center mt-1 text-xs opacity-75">
                        <span>{message.timestamp.toLocaleTimeString()}</span>
                        {message.processingTime && (
                          <span>{message.processingTime}ms</span>
                        )}
                      </div>
                    </div>
                  </div>
                ))
              )}
              
              {isLoading && (
                <div className="flex justify-start">
                  <div className="bg-gray-100 rounded-lg px-4 py-2">
                    <div className="flex space-x-1">
                      <div className="w-2 h-2 bg-gray-400 rounded-full animate-bounce"></div>
                      <div className="w-2 h-2 bg-gray-400 rounded-full animate-bounce" style={{animationDelay: '0.1s'}}></div>
                      <div className="w-2 h-2 bg-gray-400 rounded-full animate-bounce" style={{animationDelay: '0.2s'}}></div>
                    </div>
                  </div>
                </div>
              )}
              
              <div ref={chatEndRef} />
            </div>

            {/* Chat Input */}
            <div className="p-4 border-t border-gray-200">
              <div className="flex space-x-2">
                <input
                  type="text"
                  value={inputMessage}
                  onChange={(e) => setInputMessage(e.target.value)}
                  onKeyPress={(e) => e.key === 'Enter' && sendChatMessage()}
                  placeholder="Type your message to test the AI agent..."
                  className="flex-1 border border-gray-300 rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-blue-500"
                  disabled={isLoading}
                />
                <button
                  onClick={sendChatMessage}
                  disabled={isLoading || !inputMessage.trim()}
                  className="bg-blue-600 hover:bg-blue-700 disabled:bg-gray-400 text-white px-4 py-2 rounded-lg transition-colors"
                >
                  <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 19l9 2-9-18-9 18 9-2zm0 0v-8" />
                  </svg>
                </button>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};

export default AIDashboard;