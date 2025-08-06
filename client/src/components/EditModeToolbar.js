import React, { useState, useEffect } from 'react';
import { Edit3, Save, RotateCcw, Eye, EyeOff, Settings, Code, Layers } from 'lucide-react';
import { useEditMode } from '../hooks/useEditMode';

const EditModeToolbar = () => {
  const {
    isGlobalEditMode,
    toggleGlobalEditMode,
    editingComponents,
    saveAllChanges
  } = useEditMode();

  // Debug log
  useEffect(() => {
    console.log('🎨 EditModeToolbar rendered - isGlobalEditMode:', isGlobalEditMode);
  }, [isGlobalEditMode]);

  const [showPreview, setShowPreview] = useState(true);
  const [showCode, setShowCode] = useState(false);
  const [saving, setSaving] = useState(false);

  const handleSaveAll = async () => {
    setSaving(true);
    const success = await saveAllChanges();
    setSaving(false);
    
    if (success) {
      // Show success notification
      console.log('All changes saved successfully!');
    }
  };

  const getEditingCount = () => {
    return editingComponents.size;
  };

  if (!isGlobalEditMode) {
    return (
      <div 
        className="fixed bottom-4 right-4"
        style={{ 
          zIndex: 99999,
          position: 'fixed'
        }}
      >
        <button
          onClick={() => {
            console.log('🎨 FLOATING EDIT BUTTON CLICKED');
            toggleGlobalEditMode();
          }}
          className="flex items-center gap-2 px-6 py-3 bg-gradient-to-r from-blue-600 to-purple-600 text-white rounded-lg shadow-lg hover:from-blue-700 hover:to-purple-700 transition-all duration-200 font-bold text-base border border-white/20"
          style={{
            boxShadow: '0 4px 12px rgba(59, 130, 246, 0.3)',
            animation: 'pulse 2s infinite',
            position: 'relative',
            zIndex: 1
          }}
        >
          <Edit3 size={18} />
          🎨 ACTIVATE EDIT MODE
        </button>
      </div>
    );
  }

  return (
    <div className="fixed top-0 left-0 right-0 z-50 bg-white border-b border-gray-200 shadow-sm">
      <div className="max-w-7xl mx-auto px-4 py-3">
        <div className="flex items-center justify-between">
          {/* Left side - Mode indicator */}
          <div className="flex items-center gap-4">
            <div className="flex items-center gap-2">
              <div className="w-3 h-3 bg-blue-500 rounded-full animate-pulse"></div>
              <span className="text-sm font-medium text-gray-700">
                Edit Mode Active
              </span>
            </div>
            
            {getEditingCount() > 0 && (
              <div className="flex items-center gap-2 px-3 py-1 bg-yellow-100 text-yellow-800 rounded-full text-sm">
                <Layers size={14} />
                <span>{getEditingCount()} component{getEditingCount() !== 1 ? 's' : ''} editing</span>
              </div>
            )}
          </div>

          {/* Center - Tools */}
          <div className="flex items-center gap-2">
            <button
              onClick={() => setShowPreview(!showPreview)}
              className={`flex items-center gap-1 px-3 py-1.5 rounded-md text-sm font-medium transition-colors ${
                showPreview 
                  ? 'bg-green-100 text-green-700 hover:bg-green-200' 
                  : 'bg-gray-100 text-gray-700 hover:bg-gray-200'
              }`}
            >
              {showPreview ? <Eye size={14} /> : <EyeOff size={14} />}
              Preview
            </button>

            <button
              onClick={() => setShowCode(!showCode)}
              className={`flex items-center gap-1 px-3 py-1.5 rounded-md text-sm font-medium transition-colors ${
                showCode 
                  ? 'bg-purple-100 text-purple-700 hover:bg-purple-200' 
                  : 'bg-gray-100 text-gray-700 hover:bg-gray-200'
              }`}
            >
              <Code size={14} />
              Code View
            </button>

            <div className="w-px h-6 bg-gray-300 mx-2"></div>

            <button
              onClick={() => window.location.reload()}
              className="flex items-center gap-1 px-3 py-1.5 bg-gray-100 text-gray-700 rounded-md hover:bg-gray-200 transition-colors text-sm font-medium"
            >
              <RotateCcw size={14} />
              Reset
            </button>
          </div>

          {/* Right side - Actions */}
          <div className="flex items-center gap-2">
            <button
              onClick={handleSaveAll}
              disabled={saving || getEditingCount() === 0}
              className="flex items-center gap-2 px-4 py-2 bg-green-600 text-white rounded-md hover:bg-green-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors font-medium"
            >
              {saving ? (
                <>
                  <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-white"></div>
                  Saving...
                </>
              ) : (
                <>
                  <Save size={16} />
                  Save All
                </>
              )}
            </button>

            <button
              onClick={() => {
                console.log('🚪 EXIT EDIT MODE BUTTON CLICKED');
                toggleGlobalEditMode();
              }}
              className="flex items-center gap-2 px-6 py-2 bg-red-600 text-white rounded-md hover:bg-red-700 transition-colors font-bold text-lg shadow-lg"
              style={{
                boxShadow: '0 4px 12px rgba(239, 68, 68, 0.4)',
                animation: 'pulse 2s infinite'
              }}
            >
              <Eye size={18} />
              EXIT EDIT MODE
            </button>
          </div>
        </div>

        {/* Additional toolbar row for component-specific tools */}
        {showCode && (
          <div className="mt-3 pt-3 border-t border-gray-200">
            <div className="flex items-center gap-4">
              <span className="text-sm text-gray-600">Component Tools:</span>
              <button className="flex items-center gap-1 px-3 py-1 bg-blue-100 text-blue-700 rounded text-xs hover:bg-blue-200 transition-colors">
                <Settings size={12} />
                Inspector
              </button>
              <button className="flex items-center gap-1 px-3 py-1 bg-purple-100 text-purple-700 rounded text-xs hover:bg-purple-200 transition-colors">
                <Code size={12} />
                Export JSX
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
};

export default EditModeToolbar;