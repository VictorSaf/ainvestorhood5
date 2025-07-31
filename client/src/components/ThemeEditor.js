import React, { useState, useEffect } from 'react';
import { Palette, Eye, Download, Upload, RefreshCw, Copy, Check } from 'lucide-react';
import defaultTheme from '../theme/defaultTheme.json';

const ThemeEditor = () => {
  const [theme, setTheme] = useState(defaultTheme);
  const [activeSection, setActiveSection] = useState('colors');
  const [previewComponent, setPreviewComponent] = useState('buttons');
  const [copied, setCopied] = useState(false);

  const sections = [
    { id: 'colors', name: 'Colors', icon: '🎨' },
    { id: 'typography', name: 'Typography', icon: '📝' },
    { id: 'spacing', name: 'Spacing', icon: '📏' },
    { id: 'components', name: 'Components', icon: '🧩' },
    { id: 'animations', name: 'Animations', icon: '✨' },
    { id: 'gradients', name: 'Gradients', icon: '🌈' }
  ];

  const previewComponents = [
    'buttons',
    'cards', 
    'inputs',
    'badges',
    'newsCard',
    'header',
    'tabs',
    'modal'
  ];

  const copyThemeToClipboard = async () => {
    try {
      await navigator.clipboard.writeText(JSON.stringify(theme, null, 2));
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch (err) {
      console.error('Failed to copy theme:', err);
    }
  };

  const resetTheme = () => {
    setTheme(defaultTheme);
  };

  const updateThemeValue = (path, value) => {
    const keys = path.split('.');
    const newTheme = JSON.parse(JSON.stringify(theme));
    let current = newTheme;
    
    for (let i = 0; i < keys.length - 1; i++) {
      current = current[keys[i]];
    }
    
    current[keys[keys.length - 1]] = value;
    setTheme(newTheme);
  };

  const ColorPicker = ({ label, value, onChange }) => (
    <div className="flex items-center justify-between p-3 bg-gray-50 rounded-lg">
      <span className="text-sm font-medium text-gray-700">{label}</span>
      <div className="flex items-center space-x-2">
        <input
          type="color"
          value={value}
          onChange={(e) => onChange(e.target.value)}
          className="w-8 h-8 rounded border border-gray-300 cursor-pointer"
        />
        <span className="text-xs font-mono text-gray-500 min-w-[80px]">{value}</span>
      </div>
    </div>
  );

  const PreviewButton = ({ variant, style }) => (
    <button 
      className="px-4 py-2 rounded font-medium transition-all duration-200"
      style={style}
    >
      {variant.charAt(0).toUpperCase() + variant.slice(1)} Button
    </button>
  );

  const PreviewCard = ({ style }) => (
    <div 
      className="p-4 rounded-lg transition-all duration-200"
      style={style}
    >
      <h3 className="font-semibold text-gray-900 mb-2">Sample Card</h3>
      <p className="text-gray-600 text-sm">This is a preview of how cards will look with the current theme settings.</p>
    </div>
  );

  const PreviewInput = ({ style, errorStyle, isError = false }) => (
    <input
      type="text"
      placeholder="Sample input field"
      className="w-full transition-all duration-200"
      style={isError ? errorStyle : style}
    />
  );

  const PreviewBadge = ({ variant, style }) => (
    <span 
      className="inline-flex items-center px-3 py-1 rounded-full text-sm font-medium"
      style={style}
    >
      {variant.charAt(0).toUpperCase() + variant.slice(1)}
    </span>
  );

  const PreviewNewsCard = ({ style }) => (
    <div className="transition-all duration-200" style={style.container}>
      <h3 style={style.title}>Breaking: Market Analysis Shows Strong Growth</h3>
      <p style={style.summary}>
        This is a sample news article summary that demonstrates how the news cards will appear with the current theme configuration.
      </p>
      <div style={style.meta}>Source: Financial Times • 2 hours ago</div>
      <div className="flex items-center space-x-2 mt-3">
        <PreviewBadge variant="success" style={theme.components.badge.success} />
        <span className="text-sm text-gray-500">85% confidence</span>
      </div>
    </div>
  );

  const PreviewHeader = ({ style }) => (
    <div className="transition-all duration-200" style={style.container}>
      <div className="flex items-center justify-between">
        <h1 style={style.title}>AIInvestorHood</h1>
        <div className="flex items-center space-x-4">
          <span style={style.statusIndicator.online}>Live</span>
          <button className="p-2 rounded-lg hover:bg-gray-100">⚙️</button>
        </div>
      </div>
    </div>
  );

  const PreviewTabs = ({ style }) => (
    <div style={style.container}>
      <div className="flex space-x-6 p-4">
        <button style={style.tab.active}>Active Tab</button>
        <button style={style.tab.inactive}>Inactive Tab</button>
        <button style={style.tab.inactive}>Another Tab</button>
      </div>
    </div>
  );

  const renderPreview = () => {
    switch (previewComponent) {
      case 'buttons':
        return (
          <div className="space-y-4">
            <h3 className="text-lg font-semibold mb-4">Button Previews</h3>
            <div className="flex flex-wrap gap-3">
              {Object.entries(theme.components.button).map(([variant, style]) => (
                <PreviewButton key={variant} variant={variant} style={style} />
              ))}
            </div>
          </div>
        );
      
      case 'cards':
        return (
          <div className="space-y-4">
            <h3 className="text-lg font-semibold mb-4">Card Preview</h3>
            <PreviewCard style={theme.components.card.default} />
          </div>
        );
      
      case 'inputs':
        return (
          <div className="space-y-4">
            <h3 className="text-lg font-semibold mb-4">Input Previews</h3>
            <PreviewInput style={theme.components.input.default} />
            <PreviewInput style={theme.components.input.default} errorStyle={theme.components.input.error} isError={true} />
          </div>
        );
      
      case 'badges':
        return (
          <div className="space-y-4">
            <h3 className="text-lg font-semibold mb-4">Badge Previews</h3>
            <div className="flex flex-wrap gap-2">
              {Object.entries(theme.components.badge).map(([variant, style]) => (
                <PreviewBadge key={variant} variant={variant} style={style} />
              ))}
            </div>
          </div>
        );
      
      case 'newsCard':
        return (
          <div className="space-y-4">
            <h3 className="text-lg font-semibold mb-4">News Card Preview</h3>
            <PreviewNewsCard style={theme.components.newsCard} />
          </div>
        );
      
      case 'header':
        return (
          <div className="space-y-4">
            <h3 className="text-lg font-semibold mb-4">Header Preview</h3>
            <PreviewHeader style={theme.components.header} />
          </div>
        );
      
      case 'tabs':
        return (
          <div className="space-y-4">
            <h3 className="text-lg font-semibold mb-4">Tabs Preview</h3>
            <PreviewTabs style={theme.components.tabs} />
          </div>
        );
      
      default:
        return (
          <div className="text-center text-gray-500 py-8">
            Select a component to preview
          </div>
        );
    }
  };

  const renderEditor = () => {
    switch (activeSection) {
      case 'colors':
        return (
          <div className="space-y-6">
            {Object.entries(theme.colors).map(([colorName, colorShades]) => (
              <div key={colorName} className="bg-white rounded-lg p-4 border">
                <h4 className="text-lg font-semibold mb-4 capitalize">{colorName} Colors</h4>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                  {Object.entries(colorShades).map(([shade, value]) => (
                    <ColorPicker
                      key={`${colorName}-${shade}`}
                      label={`${colorName}-${shade}`}
                      value={value}
                      onChange={(newValue) => updateThemeValue(`colors.${colorName}.${shade}`, newValue)}
                    />
                  ))}
                </div>
              </div>
            ))}
          </div>
        );
      
      case 'typography':
        return (
          <div className="space-y-6">
            <div className="bg-white rounded-lg p-4 border">
              <h4 className="text-lg font-semibold mb-4">Font Family</h4>
              <div className="space-y-3">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Sans Serif</label>
                  <input
                    type="text"
                    value={theme.typography.fontFamily.sans.join(', ')}
                    onChange={(e) => updateThemeValue('typography.fontFamily.sans', e.target.value.split(', '))}
                    className="w-full px-3 py-2 border border-gray-300 rounded-md"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Monospace</label>
                  <input
                    type="text"
                    value={theme.typography.fontFamily.mono.join(', ')}
                    onChange={(e) => updateThemeValue('typography.fontFamily.mono', e.target.value.split(', '))}
                    className="w-full px-3 py-2 border border-gray-300 rounded-md"
                  />
                </div>
              </div>
            </div>
            
            <div className="bg-white rounded-lg p-4 border">
              <h4 className="text-lg font-semibold mb-4">Font Sizes</h4>
              <div className="grid grid-cols-2 gap-3">
                {Object.entries(theme.typography.fontSize).map(([size, value]) => (
                  <div key={size}>
                    <label className="block text-sm font-medium text-gray-700 mb-1">{size}</label>
                    <input
                      type="text"
                      value={value}
                      onChange={(e) => updateThemeValue(`typography.fontSize.${size}`, e.target.value)}
                      className="w-full px-3 py-2 border border-gray-300 rounded-md"
                    />
                  </div>
                ))}
              </div>
            </div>
          </div>
        );
      
      case 'spacing':
        return (
          <div className="bg-white rounded-lg p-4 border">
            <h4 className="text-lg font-semibold mb-4">Spacing Scale</h4>
            <div className="grid grid-cols-2 gap-3">
              {Object.entries(theme.spacing).map(([size, value]) => (
                <div key={size}>
                  <label className="block text-sm font-medium text-gray-700 mb-1">{size}</label>
                  <input
                    type="text"
                    value={value}
                    onChange={(e) => updateThemeValue(`spacing.${size}`, e.target.value)}
                    className="w-full px-3 py-2 border border-gray-300 rounded-md"
                  />
                </div>
              ))}
            </div>
          </div>
        );
      
      case 'components':
        return (
          <div className="space-y-4">
            <div className="bg-blue-50 border border-blue-200 rounded-lg p-4">
              <p className="text-blue-800 text-sm">
                Component styles are complex nested objects. Use the preview panel to see how changes affect the appearance, 
                then export the theme to get the complete JSON configuration.
              </p>
            </div>
            <div className="bg-white rounded-lg p-4 border">
              <h4 className="text-lg font-semibold mb-4">Available Components</h4>
              <div className="grid grid-cols-2 md:grid-cols-3 gap-2">
                {Object.keys(theme.components).map((component) => (
                  <div key={component} className="px-3 py-2 bg-gray-100 rounded-md text-sm font-medium">
                    {component}
                  </div>
                ))}
              </div>
            </div>
          </div>
        );
      
      case 'gradients':
        return (
          <div className="bg-white rounded-lg p-4 border">
            <h4 className="text-lg font-semibold mb-4">Gradient Presets</h4>
            <div className="space-y-4">
              {Object.entries(theme.gradients).map(([name, gradient]) => (
                <div key={name} className="flex items-center justify-between p-3 bg-gray-50 rounded-lg">
                  <div className="flex items-center space-x-3">
                    <div 
                      className="w-12 h-8 rounded"
                      style={{ background: gradient }}
                    ></div>
                    <span className="font-medium capitalize">{name}</span>
                  </div>
                  <input
                    type="text"
                    value={gradient}
                    onChange={(e) => updateThemeValue(`gradients.${name}`, e.target.value)}
                    className="w-80 px-3 py-1 text-sm border border-gray-300 rounded-md font-mono"
                  />
                </div>
              ))}
            </div>
          </div>
        );
      
      default:
        return <div>Select a section to edit</div>;
    }
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="bg-white rounded-lg shadow p-6">
        <div className="flex items-center justify-between mb-4">
          <div className="flex items-center space-x-3">
            <div className="inline-flex items-center justify-center w-10 h-10 bg-gradient-to-br from-purple-500 to-pink-600 rounded-lg">
              <Palette size={20} className="text-white" />
            </div>
            <div>
              <h2 className="text-xl font-bold text-gray-900">Theme Editor</h2>
              <p className="text-gray-600">Customize the visual appearance of your application</p>
            </div>
          </div>
          <div className="flex items-center space-x-2">
            <button
              onClick={copyThemeToClipboard}
              className="flex items-center space-x-2 px-3 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors"
            >
              {copied ? <Check size={16} /> : <Copy size={16} />}
              <span>{copied ? 'Copied!' : 'Export'}</span>
            </button>
            <button
              onClick={resetTheme}
              className="flex items-center space-x-2 px-3 py-2 bg-gray-600 text-white rounded-lg hover:bg-gray-700 transition-colors"
            >
              <RefreshCw size={16} />
              <span>Reset</span>
            </button>
          </div>
        </div>

        {/* Theme Info */}
        <div className="bg-gray-50 rounded-lg p-4">
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4 text-sm">
            <div>
              <span className="text-gray-600">Theme Name:</span>
              <p className="font-medium">{theme.name}</p>
            </div>
            <div>
              <span className="text-gray-600">Version:</span>
              <p className="font-medium">{theme.version}</p>
            </div>
            <div>
              <span className="text-gray-600">Components:</span>
              <p className="font-medium">{Object.keys(theme.components).length}</p>
            </div>
            <div>
              <span className="text-gray-600">Colors:</span>
              <p className="font-medium">{Object.keys(theme.colors).length} palettes</p>
            </div>
          </div>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Editor Panel */}
        <div className="lg:col-span-2 space-y-4">
          {/* Section Navigation */}
          <div className="bg-white rounded-lg shadow border-b">
            <nav className="flex space-x-6 px-6">
              {sections.map((section) => (
                <button
                  key={section.id}
                  onClick={() => setActiveSection(section.id)}
                  className={`py-4 px-1 border-b-2 font-medium text-sm flex items-center space-x-2 ${
                    activeSection === section.id
                      ? 'border-blue-500 text-blue-600'
                      : 'border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300'
                  }`}
                >
                  <span>{section.icon}</span>
                  <span>{section.name}</span>
                </button>
              ))}
            </nav>
          </div>

          {/* Editor Content */}
          <div className="min-h-[500px]">
            {renderEditor()}
          </div>
        </div>

        {/* Preview Panel */}
        <div className="space-y-4">
          <div className="bg-white rounded-lg shadow p-4">
            <div className="flex items-center space-x-2 mb-4">
              <Eye size={16} className="text-gray-600" />
              <h3 className="font-semibold text-gray-900">Live Preview</h3>
            </div>
            
            {/* Preview Component Selector */}
            <select
              value={previewComponent}
              onChange={(e) => setPreviewComponent(e.target.value)}
              className="w-full px-3 py-2 border border-gray-300 rounded-md mb-4"
            >
              {previewComponents.map((component) => (
                <option key={component} value={component}>
                  {component.charAt(0).toUpperCase() + component.slice(1)}
                </option>
              ))}
            </select>

            {/* Preview Content */}
            <div className="border border-gray-200 rounded-lg p-4 min-h-[200px]">
              {renderPreview()}
            </div>
          </div>

          {/* Color Palette Quick View */}
          <div className="bg-white rounded-lg shadow p-4">
            <h3 className="font-semibold text-gray-900 mb-4">Color Palette</h3>
            <div className="space-y-3">
              {Object.entries(theme.colors).map(([colorName, shades]) => (
                <div key={colorName}>
                  <h4 className="text-sm font-medium text-gray-700 mb-2 capitalize">{colorName}</h4>
                  <div className="flex space-x-1">
                    {Object.entries(shades).map(([shade, color]) => (
                      <div
                        key={`${colorName}-${shade}`}
                        className="w-6 h-6 rounded border border-gray-300"
                        style={{ backgroundColor: color }}
                        title={`${colorName}-${shade}: ${color}`}
                      ></div>
                    ))}
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};

export default ThemeEditor;