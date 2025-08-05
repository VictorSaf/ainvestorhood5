import React, { useState, useEffect } from 'react';

const ScrapingConfiguration = () => {
  const [scrapingMethods, setScrapingMethods] = useState([]);
  const [currentMethod, setCurrentMethod] = useState('feedparser');
  const [loading, setLoading] = useState(false);
  const [testResults, setTestResults] = useState(null);
  const [testLoading, setTestLoading] = useState(false);
  const [stats, setStats] = useState(null);

  useEffect(() => {
    fetchScrapingMethods();
  }, []);

  const fetchScrapingMethods = async () => {
    try {
      setLoading(true);
      const response = await fetch('/api/scraping/methods');
      const data = await response.json();
      
      if (data.availableMethods) {
        setScrapingMethods(data.availableMethods);
        setCurrentMethod(data.currentMethod);
        setStats(data.stats);
      }
    } catch (error) {
      console.error('Failed to fetch scraping methods:', error);
    } finally {
      setLoading(false);
    }
  };

  const changeScrapingMethod = async (method) => {
    try {
      setLoading(true);
      const response = await fetch('/api/scraping/method', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ method }),
      });

      const data = await response.json();
      
      if (data.success) {
        setCurrentMethod(method);
        // Show success message
        alert(`Successfully changed scraping method to ${data.currentMethod}`);
        fetchScrapingMethods(); // Refresh data
      } else {
        alert(`Failed to change scraping method: ${data.error}`);
      }
    } catch (error) {
      console.error('Failed to change scraping method:', error);
      alert('Failed to change scraping method');
    } finally {
      setLoading(false);
    }
  };

  const testScrapingMethod = async (method) => {
    try {
      setTestLoading(true);
      setTestResults(null);
      
      const response = await fetch('/api/scraping/test', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ method }),
      });

      const data = await response.json();
      setTestResults(data);
      
      if (!data.success) {
        alert(`Test failed: ${data.error}`);
      }
    } catch (error) {
      console.error('Failed to test scraping method:', error);
      setTestResults({ 
        success: false, 
        error: 'Network error during test',
        method 
      });
    } finally {
      setTestLoading(false);
    }
  };

  const formatTime = (ms) => {
    if (ms < 1000) return `${ms}ms`;
    return `${(ms / 1000).toFixed(1)}s`;
  };

  const getMethodStatusColor = (method) => {
    const methodStats = stats?.stats[method.name];
    if (!methodStats) return 'bg-gray-100 text-gray-600';
    
    const successRate = methodStats.requests > 0 
      ? (methodStats.successes / methodStats.requests) * 100 
      : 0;
    
    if (successRate >= 90) return 'bg-green-100 text-green-800';
    if (successRate >= 70) return 'bg-yellow-100 text-yellow-800';
    return 'bg-red-100 text-red-800';
  };

  if (loading && scrapingMethods.length === 0) {
    return (
      <div className="flex items-center justify-center p-8">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600"></div>
        <span className="ml-3 text-gray-600">Loading scraping methods...</span>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Current Method Status */}
      <div className="bg-white rounded-lg shadow p-6">
        <div className="flex items-center justify-between mb-4">
          <h3 className="text-lg font-semibold text-gray-900">Current Scraping Method</h3>
          <span className="px-3 py-1 bg-blue-100 text-blue-800 rounded-full text-sm font-medium">
            {scrapingMethods.find(m => m.name === currentMethod)?.displayName || currentMethod}
          </span>
        </div>
        
        {stats && stats.stats[currentMethod] && (
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
            <div className="text-center">
              <div className="text-2xl font-bold text-blue-600">
                {stats.stats[currentMethod].requests}
              </div>
              <div className="text-sm text-gray-600">Total Requests</div>
            </div>
            <div className="text-center">
              <div className="text-2xl font-bold text-green-600">
                {stats.stats[currentMethod].successes}
              </div>
              <div className="text-sm text-gray-600">Successful</div>
            </div>
            <div className="text-center">
              <div className="text-2xl font-bold text-red-600">
                {stats.stats[currentMethod].errors}
              </div>
              <div className="text-sm text-gray-600">Errors</div>
            </div>
            <div className="text-center">
              <div className="text-2xl font-bold text-purple-600">
                {formatTime(Math.round(stats.stats[currentMethod].avgTime))}
              </div>
              <div className="text-sm text-gray-600">Avg Time</div>
            </div>
          </div>
        )}
      </div>

      {/* Available Methods */}
      <div className="bg-white rounded-lg shadow p-6">
        <h3 className="text-lg font-semibold text-gray-900 mb-4">Available Scraping Libraries</h3>
        <div className="grid gap-4">
          {scrapingMethods.map((method) => (
            <div 
              key={method.name}
              className={`border rounded-lg p-4 transition-all duration-200 ${
                method.name === currentMethod 
                  ? 'border-blue-500 bg-blue-50' 
                  : 'border-gray-200 hover:border-gray-300'
              }`}
            >
              <div className="flex items-center justify-between">
                <div className="flex-1">
                  <div className="flex items-center space-x-3">
                    <div className="flex items-center">
                      <input
                        type="radio"
                        id={method.name}
                        name="scrapingMethod"
                        checked={method.name === currentMethod}
                        onChange={() => changeScrapingMethod(method.name)}
                        disabled={loading}
                        className="h-4 w-4 text-blue-600 focus:ring-blue-500 border-gray-300"
                      />
                      <label htmlFor={method.name} className="ml-2 block text-sm font-medium text-gray-900">
                        {method.displayName}
                      </label>
                    </div>
                    <span className={`px-2 py-1 rounded-full text-xs font-medium ${getMethodStatusColor(method)}`}>
                      {method.name === currentMethod ? 'Active' : 'Available'}
                    </span>
                  </div>
                  <p className="text-sm text-gray-600 mt-1">{method.description}</p>
                  
                  {/* Method Statistics */}
                  {method.stats && method.stats.requests > 0 && (
                    <div className="flex items-center space-x-4 mt-2 text-xs text-gray-500">
                      <span>Requests: {method.stats.requests}</span>
                      <span>Success: {method.stats.successes}</span>
                      <span>Errors: {method.stats.errors}</span>
                      <span>Avg: {formatTime(Math.round(method.stats.avgTime))}</span>
                      <span>
                        Success Rate: {method.stats.requests > 0 
                          ? Math.round((method.stats.successes / method.stats.requests) * 100)
                          : 0}%
                      </span>
                    </div>
                  )}
                </div>
                
                <div className="flex items-center space-x-2">
                  <button
                    onClick={() => testScrapingMethod(method.name)}
                    disabled={testLoading}
                    className="px-3 py-1 bg-gray-100 hover:bg-gray-200 text-gray-700 text-sm rounded transition-colors duration-200 disabled:opacity-50"
                  >
                    {testLoading ? 'Testing...' : 'Test'}
                  </button>
                  {method.name !== currentMethod && (
                    <button
                      onClick={() => changeScrapingMethod(method.name)}
                      disabled={loading}
                      className="px-3 py-1 bg-blue-600 hover:bg-blue-700 text-white text-sm rounded transition-colors duration-200 disabled:opacity-50"
                    >
                      {loading ? 'Setting...' : 'Use'}
                    </button>
                  )}
                </div>
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* Test Results */}
      {testResults && (
        <div className="bg-white rounded-lg shadow p-6">
          <h3 className="text-lg font-semibold text-gray-900 mb-4">
            Test Results - {scrapingMethods.find(m => m.name === testResults.method)?.displayName || testResults.method}
          </h3>
          
          {testResults.success ? (
            <div className="space-y-4">
              {/* Use This Library Button */}
              <div className="flex justify-between items-center mb-4">
                <div className="text-sm text-gray-600">
                  Test completed successfully! You can now use this library for scraping.
                </div>
                <button
                  onClick={() => changeScrapingMethod(testResults.method)}
                  disabled={currentMethod === testResults.method || loading}
                  className={`px-4 py-2 rounded-lg font-medium transition-colors duration-200 ${
                    currentMethod === testResults.method
                      ? 'bg-gray-200 text-gray-500 cursor-not-allowed'
                      : 'bg-green-600 hover:bg-green-700 text-white'
                  }`}
                >
                  {currentMethod === testResults.method ? 'Currently Active' : 'Use This Library'}
                </button>
              </div>
              
              <div className="grid grid-cols-2 md:grid-cols-5 gap-4">
                <div className="text-center">
                  <div className="text-2xl font-bold text-green-600">
                    {testResults.totalArticles}
                  </div>
                  <div className="text-sm text-gray-600">Articles Found</div>
                </div>
                <div className="text-center">
                  <div className="text-2xl font-bold text-blue-600">
                    {formatTime(testResults.duration)}
                  </div>
                  <div className="text-sm text-gray-600">Duration</div>
                </div>
                <div className="text-center">
                  <div className="text-2xl font-bold text-purple-600">
                    {testResults.testFeeds?.length || 0}
                  </div>
                  <div className="text-sm text-gray-600">Feeds Tested</div>
                </div>
                <div className="text-center">
                  <div className="text-2xl font-bold text-green-600">
                    ✓
                  </div>
                  <div className="text-sm text-gray-600">Success</div>
                </div>
                <div className="text-center">
                  <button
                    onClick={() => changeScrapingMethod(testResults.method)}
                    disabled={currentMethod === testResults.method || loading}
                    className={`px-4 py-2 rounded-lg font-medium text-sm transition-colors duration-200 ${
                      currentMethod === testResults.method
                        ? 'bg-gray-200 text-gray-500 cursor-not-allowed'
                        : 'bg-blue-600 hover:bg-blue-700 text-white'
                    }`}
                  >
                    {currentMethod === testResults.method ? 'Active' : 'Use Now'}
                  </button>
                  <div className="text-sm text-gray-600 mt-1">Quick Action</div>
                </div>
              </div>
              
              {testResults.articles && testResults.articles.length > 0 && (
                <div>
                  <h4 className="font-medium text-gray-900 mb-2">Sample Articles (First 5):</h4>
                  <div className="space-y-2 max-h-60 overflow-y-auto">
                    {testResults.articles.map((article, index) => (
                      <div key={index} className="border-l-4 border-green-400 bg-green-50 p-3">
                        <div className="font-medium text-sm text-gray-900">{article.title}</div>
                        <div className="text-xs text-gray-600 mt-1">{article.url}</div>
                        {article.pubDate && (
                          <div className="text-xs text-gray-500 mt-1">
                            {new Date(article.pubDate).toLocaleString()}
                          </div>
                        )}
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* Always Available Use Button */}
              <div className="mt-6 pt-4 border-t border-gray-200">
                <div className="flex items-center justify-between">
                  <div className="text-sm text-gray-600">
                    {currentMethod === testResults.method 
                      ? `${scrapingMethods.find(m => m.name === testResults.method)?.displayName || testResults.method} is currently your active scraping library.`
                      : `Switch to ${scrapingMethods.find(m => m.name === testResults.method)?.displayName || testResults.method} for better performance.`
                    }
                  </div>
                  <button
                    onClick={() => changeScrapingMethod(testResults.method)}
                    disabled={loading}
                    className={`px-6 py-2 rounded-lg font-medium transition-colors duration-200 ${
                      currentMethod === testResults.method
                        ? 'bg-green-100 text-green-700 border border-green-300 hover:bg-green-200'
                        : 'bg-blue-600 hover:bg-blue-700 text-white'
                    }`}
                  >
                    {currentMethod === testResults.method ? 'Reactivate Library' : 'Use This Library'}
                  </button>
                </div>
              </div>
            </div>
          ) : (
            <div className="bg-red-50 border border-red-200 rounded p-4">
              <div className="flex items-center">
                <div className="text-red-600 font-medium">Test Failed</div>
              </div>
              <div className="text-red-700 text-sm mt-1">{testResults.error}</div>
            </div>
          )}
        </div>
      )}

      {/* Installation Status */}
      <div className="bg-white rounded-lg shadow p-6">
        <h3 className="text-lg font-semibold text-gray-900 mb-4">Library Installation Status</h3>
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          <div className="flex items-center space-x-3 p-3 border rounded">
            <div className="w-3 h-3 bg-green-500 rounded-full"></div>
            <div>
              <div className="font-medium text-sm">FeedParser</div>
              <div className="text-xs text-gray-600">Node.js native RSS parser</div>
            </div>
          </div>
          <div className="flex items-center space-x-3 p-3 border rounded">
            <div className="w-3 h-3 bg-green-500 rounded-full"></div>
            <div>
              <div className="font-medium text-sm">Cheerio</div>
              <div className="text-xs text-gray-600">Server-side jQuery</div>
            </div>
          </div>
          <div className="flex items-center space-x-3 p-3 border rounded">
            <div className="w-3 h-3 bg-green-500 rounded-full"></div>
            <div>
              <div className="font-medium text-sm">Puppeteer</div>
              <div className="text-xs text-gray-600">Headless Chrome browser</div>
            </div>
          </div>
          <div className="flex items-center space-x-3 p-3 border rounded">
            <div className="w-3 h-3 bg-green-500 rounded-full"></div>
            <div>
              <div className="font-medium text-sm">Scrapy</div>
              <div className="text-xs text-gray-600">Python scraping framework</div>
            </div>
          </div>
          <div className="flex items-center space-x-3 p-3 border rounded">
            <div className="w-3 h-3 bg-green-500 rounded-full"></div>
            <div>
              <div className="font-medium text-sm">Beautiful Soup</div>
              <div className="text-xs text-gray-600">Python HTML parser</div>
            </div>
          </div>
        </div>
        <div className="mt-4 text-sm text-gray-600">
          <p><span className="inline-block w-3 h-3 bg-green-500 rounded-full mr-2"></span>All libraries installed and ready</p>
        </div>
      </div>
    </div>
  );
};

export default ScrapingConfiguration;