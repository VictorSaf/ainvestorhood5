import React, { useState } from 'react';
import AdvancedCSSEditor from './AdvancedCSSEditor';
import { Settings, Code } from 'lucide-react';

/**
 * Example integration of the AdvancedCSSEditor component
 * This shows how to integrate the CSS editor with your existing application
 */
const AdvancedCSSEditorExample = () => {
  const [showCSSEditor, setShowCSSEditor] = useState(false);

  return (
    <div className="min-h-screen bg-gray-100">
      {/* Example app header with CSS editor toggle */}
      <header className="bg-white shadow-sm border-b p-4">
        <div className="flex items-center justify-between max-w-7xl mx-auto">
          <div className="flex items-center space-x-3">
            <h1 className="text-2xl font-bold text-gray-900">My React App</h1>
          </div>
          
          <div className="flex items-center space-x-4">
            <button
              onClick={() => setShowCSSEditor(!showCSSEditor)}
              className={`flex items-center space-x-2 px-4 py-2 rounded-lg font-medium transition-colors ${
                showCSSEditor
                  ? 'bg-purple-600 text-white hover:bg-purple-700'
                  : 'bg-gray-600 text-white hover:bg-gray-700'
              }`}
            >
              <Code size={16} />
              <span>{showCSSEditor ? 'Hide CSS Editor' : 'Open CSS Editor'}</span>
            </button>
          </div>
        </div>
      </header>

      {/* Main content area */}
      <main className="max-w-7xl mx-auto p-6">
        {showCSSEditor ? (
          // Full-screen CSS editor
          <AdvancedCSSEditor />
        ) : (
          // Example content that can be styled
          <div className="space-y-6">
            <div className="bg-white rounded-lg shadow p-6">
              <h2 className="text-xl font-semibold text-gray-900 mb-4">
                Welcome to the CSS Editor Demo
              </h2>
              <p className="text-gray-600 mb-4">
                Click "Open CSS Editor" above to start inspecting and editing the styles of any element on this page.
              </p>
              
              <div className="grid md:grid-cols-2 gap-6 mt-6">
                <div className="bg-blue-50 border border-blue-200 rounded-lg p-4">
                  <h3 className="font-medium text-blue-900 mb-2">Inspect Elements</h3>
                  <p className="text-blue-700 text-sm">
                    Use the inspector to click on any element and view its computed styles.
                  </p>
                </div>
                
                <div className="bg-green-50 border border-green-200 rounded-lg p-4">
                  <h3 className="font-medium text-green-900 mb-2">Edit CSS Live</h3>
                  <p className="text-green-700 text-sm">
                    Modify CSS properties and see changes instantly in real-time.
                  </p>
                </div>
                
                <div className="bg-purple-50 border border-purple-200 rounded-lg p-4">
                  <h3 className="font-medium text-purple-900 mb-2">Browse Classes</h3>
                  <p className="text-purple-700 text-sm">
                    Explore all available CSS classes and their associated styles.
                  </p>
                </div>
                
                <div className="bg-yellow-50 border border-yellow-200 rounded-lg p-4">
                  <h3 className="font-medium text-yellow-900 mb-2">Custom CSS</h3>
                  <p className="text-yellow-700 text-sm">
                    Add custom CSS rules that are applied immediately to the page.
                  </p>
                </div>
              </div>
            </div>

            {/* Sample components to style */}
            <div className="grid md:grid-cols-3 gap-6">
              <div className="bg-white rounded-lg shadow p-6">
                <div className="w-12 h-12 bg-gradient-to-r from-blue-500 to-purple-600 rounded-lg mb-4"></div>
                <h3 className="font-semibold text-gray-900 mb-2">Card Component</h3>
                <p className="text-gray-600 text-sm mb-4">
                  This is a sample card component that you can inspect and modify.
                </p>
                <button className="bg-blue-600 text-white px-4 py-2 rounded-lg text-sm hover:bg-blue-700 transition-colors">
                  Action Button
                </button>
              </div>

              <div className="bg-white rounded-lg shadow p-6">
                <div className="w-12 h-12 bg-gradient-to-r from-green-500 to-teal-600 rounded-lg mb-4"></div>
                <h3 className="font-semibold text-gray-900 mb-2">Another Card</h3>
                <p className="text-gray-600 text-sm mb-4">
                  Try inspecting different elements to see how the CSS editor works.
                </p>
                <span className="inline-flex items-center px-3 py-1 rounded-full text-xs font-medium bg-green-100 text-green-800">
                  Status Badge
                </span>
              </div>

              <div className="bg-white rounded-lg shadow p-6">
                <div className="w-12 h-12 bg-gradient-to-r from-red-500 to-pink-600 rounded-lg mb-4"></div>
                <h3 className="font-semibold text-gray-900 mb-2">Third Card</h3>
                <p className="text-gray-600 text-sm mb-4">
                  Each element can be inspected and styled individually.
                </p>
                <div className="flex space-x-2">
                  <button className="bg-red-600 text-white px-3 py-1 rounded text-sm">
                    Primary
                  </button>
                  <button className="bg-gray-200 text-gray-800 px-3 py-1 rounded text-sm">
                    Secondary
                  </button>
                </div>
              </div>
            </div>

            <div className="bg-white rounded-lg shadow p-6">
              <h3 className="font-semibold text-gray-900 mb-4">Form Example</h3>
              <div className="grid md:grid-cols-2 gap-6">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">
                    Text Input
                  </label>
                  <input
                    type="text"
                    placeholder="Enter some text..."
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">
                    Select Input
                  </label>
                  <select className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500">
                    <option>Choose an option...</option>
                    <option>Option 1</option>
                    <option>Option 2</option>
                    <option>Option 3</option>
                  </select>
                </div>
              </div>
            </div>
          </div>
        )}
      </main>
    </div>
  );
};

export default AdvancedCSSEditorExample;