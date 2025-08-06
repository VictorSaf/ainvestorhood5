import React, { useState, useEffect } from 'react';
import { Palette, Eye, Download, Upload, RefreshCw, Copy, Check } from 'lucide-react';
import defaultTheme from '../theme/defaultTheme.json';

const ThemeEditor = () => {
  const [theme, setTheme] = useState(defaultTheme);
  const [activeSection, setActiveSection] = useState('colors');
  const [previewComponent, setPreviewComponent] = useState('buttons');
  const [copied, setCopied] = useState(false);
  const [isEditing, setIsEditing] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    loadThemeFromDatabase();
  }, []);

  const loadThemeFromDatabase = async () => {
    try {
      const response = await fetch('http://localhost:8080/api/theme');
      if (response.ok) {
        const savedTheme = await response.json();
        setTheme(savedTheme);
      }
    } catch (error) {
      console.error('Failed to load theme from database:', error);
    } finally {
      setLoading(false);
    }
  };

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

  const resetTheme = async () => {
    try {
      const response = await fetch('http://localhost:8080/api/theme', {
        method: 'DELETE',
      });
      if (response.ok) {
        const result = await response.json();
        setTheme(result.theme);
      }
    } catch (error) {
      console.error('Failed to reset theme:', error);
      // Fallback to local reset
      setTheme(defaultTheme);
    }
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
    
    // Auto-save to database
    saveThemeToDatabase(newTheme);
  };

  const saveThemeToDatabase = async (themeData) => {
    try {
      await fetch('http://localhost:8080/api/theme', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(themeData),
      });
    } catch (error) {
      console.error('Failed to save theme to database:', error);
    }
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

  // Editable components
  const EditableColorInput = ({ label, value, onChange, path }) => (
    <div className="inline-flex items-center space-x-2 bg-white rounded-lg p-2 border border-gray-200 shadow-sm">
      <span className="text-xs font-medium text-gray-600">{label}</span>
      <input
        type="color"
        value={value}
        onChange={(e) => {
          onChange(e.target.value);
          updateThemeValue(path, e.target.value);
        }}
        className="w-8 h-8 rounded border border-gray-300 cursor-pointer"
      />
      <span className="text-xs text-gray-500 font-mono">{value}</span>
    </div>
  );

  const EditableTextInput = ({ label, value, onChange, path, type = "text" }) => (
    <div className="inline-flex items-center space-x-2 bg-white rounded-lg p-2 border border-gray-200 shadow-sm">
      <span className="text-xs font-medium text-gray-600">{label}</span>
      <input
        type={type}
        value={value}
        onChange={(e) => {
          onChange(e.target.value);
          updateThemeValue(path, e.target.value);
        }}
        className="px-2 py-1 text-xs border border-gray-300 rounded"
      />
    </div>
  );

  const EditableButton = ({ variant, style, path }) => {
    const [tempStyles, setTempStyles] = useState(style);
    
    return (
      <div className="space-y-3">
        <button 
          className="px-4 py-2 rounded font-medium transition-all duration-200"
          style={tempStyles}
        >
          {variant.charAt(0).toUpperCase() + variant.slice(1)} Button
        </button>
        <div className="flex flex-wrap gap-2">
          <EditableColorInput
            label="Background"
            value={tempStyles.background}
            onChange={(value) => setTempStyles({...tempStyles, background: value})}
            path={`${path}.background`}
          />
          <EditableColorInput
            label="Color"
            value={tempStyles.color}
            onChange={(value) => setTempStyles({...tempStyles, color: value})}
            path={`${path}.color`}
          />
          <EditableTextInput
            label="Padding"
            value={tempStyles.padding}
            onChange={(value) => setTempStyles({...tempStyles, padding: value})}
            path={`${path}.padding`}
          />
          <EditableTextInput
            label="Border Radius"
            value={tempStyles.borderRadius}
            onChange={(value) => setTempStyles({...tempStyles, borderRadius: value})}
            path={`${path}.borderRadius`}
          />
        </div>
      </div>
    );
  };

  const EditableCard = ({ style, path }) => {
    const [tempStyles, setTempStyles] = useState(style);
    
    return (
      <div className="space-y-3">
        <div 
          className="p-4 rounded-lg transition-all duration-200"
          style={tempStyles}
        >
          <h3 className="font-semibold text-gray-900 mb-2">Sample Card</h3>
          <p className="text-gray-600 text-sm">This is a preview of how cards will look with the current theme settings.</p>
        </div>
        <div className="flex flex-wrap gap-2">
          <EditableColorInput
            label="Background"
            value={tempStyles.background}
            onChange={(value) => setTempStyles({...tempStyles, background: value})}
            path={`${path}.background`}
          />
          <EditableTextInput
            label="Border"
            value={tempStyles.border}
            onChange={(value) => setTempStyles({...tempStyles, border: value})}
            path={`${path}.border`}
          />
          <EditableTextInput
            label="Border Radius"
            value={tempStyles.borderRadius}
            onChange={(value) => setTempStyles({...tempStyles, borderRadius: value})}
            path={`${path}.borderRadius`}
          />
          <EditableTextInput
            label="Padding"
            value={tempStyles.padding}
            onChange={(value) => setTempStyles({...tempStyles, padding: value})}
            path={`${path}.padding`}
          />
        </div>
      </div>
    );
  };

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

  const renderEditablePreview = () => {
    switch (previewComponent) {
      case 'buttons':
        return (
          <div className="space-y-6">
            <h3 className="text-lg font-semibold mb-4">Editable Button Previews</h3>
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
              {Object.entries(theme.components.button).map(([variant, style]) => (
                <div key={variant} className="bg-white p-4 rounded-lg border">
                  <h4 className="text-sm font-medium text-gray-700 mb-3 capitalize">{variant}</h4>
                  <EditableButton
                    variant={variant}
                    style={style}
                    path={`components.button.${variant}`}
                  />
                </div>
              ))}
            </div>
          </div>
        );
      
      case 'cards':
        return (
          <div className="space-y-6">
            <h3 className="text-lg font-semibold mb-4">Editable Card Preview</h3>
            <div className="bg-white p-4 rounded-lg border">
              <EditableCard
                style={theme.components.card.default}
                path="components.card.default"
              />
            </div>
          </div>
        );
      
      case 'inputs':
        return (
          <div className="space-y-6">
            <h3 className="text-lg font-semibold mb-4">Editable Input Previews</h3>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              <div className="bg-white p-4 rounded-lg border">
                <h4 className="text-sm font-medium text-gray-700 mb-3">Default Input</h4>
                <div className="space-y-3">
                  <input
                    type="text"
                    placeholder="Sample input field"
                    className="w-full transition-all duration-200"
                    style={theme.components.input.default}
                  />
                  <div className="flex flex-wrap gap-2">
                    <EditableColorInput
                      label="Background"
                      value={theme.components.input.default.background}
                      onChange={() => {}}
                      path="components.input.default.background"
                    />
                    <EditableTextInput
                      label="Border"
                      value={theme.components.input.default.border}
                      onChange={() => {}}
                      path="components.input.default.border"
                    />
                    <EditableTextInput
                      label="Padding"
                      value={theme.components.input.default.padding}
                      onChange={() => {}}
                      path="components.input.default.padding"
                    />
                  </div>
                </div>
              </div>
              <div className="bg-white p-4 rounded-lg border">
                <h4 className="text-sm font-medium text-gray-700 mb-3">Error Input</h4>
                <div className="space-y-3">
                  <input
                    type="text"
                    placeholder="Error input field"
                    className="w-full transition-all duration-200"
                    style={theme.components.input.error}
                  />
                  <div className="flex flex-wrap gap-2">
                    <EditableColorInput
                      label="Border Color"
                      value={theme.components.input.error.borderColor}
                      onChange={() => {}}
                      path="components.input.error.borderColor"
                    />
                    <EditableColorInput
                      label="Background"
                      value={theme.components.input.error.background}
                      onChange={() => {}}
                      path="components.input.error.background"
                    />
                  </div>
                </div>
              </div>
            </div>
          </div>
        );
      
      case 'badges':
        return (
          <div className="space-y-6">
            <h3 className="text-lg font-semibold mb-4">Editable Badge Previews</h3>
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
              {Object.entries(theme.components.badge).map(([variant, style]) => (
                <div key={variant} className="bg-white p-4 rounded-lg border">
                  <h4 className="text-sm font-medium text-gray-700 mb-3 capitalize">{variant}</h4>
                  <div className="space-y-3">
                    <span 
                      className="inline-flex items-center px-3 py-1 rounded-full text-sm font-medium"
                      style={style}
                    >
                      {variant.charAt(0).toUpperCase() + variant.slice(1)}
                    </span>
                    <div className="flex flex-wrap gap-2">
                      <EditableColorInput
                        label="Background"
                        value={style.background}
                        onChange={() => {}}
                        path={`components.badge.${variant}.background`}
                      />
                      <EditableColorInput
                        label="Color"
                        value={style.color}
                        onChange={() => {}}
                        path={`components.badge.${variant}.color`}
                      />
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </div>
        );
      
      case 'newsCard':
        return (
          <div className="space-y-6">
            <h3 className="text-lg font-semibold mb-4">Editable News Card Preview</h3>
            <div className="bg-white p-4 rounded-lg border">
              <div className="space-y-4">
                <div className="transition-all duration-200" style={theme.components.newsCard.container}>
                  <h3 style={theme.components.newsCard.title}>Breaking: Market Analysis Shows Strong Growth</h3>
                  <p style={theme.components.newsCard.summary}>
                    This is a sample news article summary that demonstrates how the news cards will appear with the current theme configuration.
                  </p>
                  <div style={theme.components.newsCard.meta}>Source: Financial Times • 2 hours ago</div>
                  <div className="flex items-center space-x-2 mt-3">
                    <span 
                      className="inline-flex items-center px-3 py-1 rounded-full text-sm font-medium"
                      style={theme.components.badge.success}
                    >
                      Success
                    </span>
                    <span className="text-sm text-gray-500">85% confidence</span>
                  </div>
                </div>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div>
                    <h4 className="text-sm font-medium mb-2">Container Styles</h4>
                    <div className="flex flex-wrap gap-2">
                      <EditableColorInput
                        label="Background"
                        value={theme.components.newsCard.container.background}
                        onChange={() => {}}
                        path="components.newsCard.container.background"
                      />
                      <EditableTextInput
                        label="Border"
                        value={theme.components.newsCard.container.border}
                        onChange={() => {}}
                        path="components.newsCard.container.border"
                      />
                      <EditableTextInput
                        label="Border Radius"
                        value={theme.components.newsCard.container.borderRadius}
                        onChange={() => {}}
                        path="components.newsCard.container.borderRadius"
                      />
                    </div>
                  </div>
                  <div>
                    <h4 className="text-sm font-medium mb-2">Typography</h4>
                    <div className="flex flex-wrap gap-2">
                      <EditableTextInput
                        label="Title Font Size"
                        value={theme.components.newsCard.title.fontSize}
                        onChange={() => {}}
                        path="components.newsCard.title.fontSize"
                      />
                      <EditableColorInput
                        label="Title Color"
                        value={theme.components.newsCard.title.color}
                        onChange={() => {}}
                        path="components.newsCard.title.color"
                      />
                      <EditableColorInput
                        label="Summary Color"
                        value={theme.components.newsCard.summary.color}
                        onChange={() => {}}
                        path="components.newsCard.summary.color"
                      />
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </div>
        );
      
      default:
        return (
          <div className="text-center text-gray-500 py-8">
            <p>Select a component to preview and edit</p>
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

  if (loading) {
    return (
      <div className="flex items-center justify-center py-12">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-500"></div>
        <span className="ml-3 text-gray-600">Loading theme editor...</span>
      </div>
    );
  }

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

      {/* Editor Panel */}
      <div className="space-y-4">
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
        <div className="min-h-[400px]">
          {renderEditor()}
        </div>
      </div>

      {/* Live Preview Panel - Full Width Bottom */}
      <div className="bg-white rounded-lg shadow p-6">
        <div className="flex items-center justify-between mb-6">
          <div className="flex items-center space-x-2">
            <Eye size={20} className="text-blue-600" />
            <h3 className="text-xl font-semibold text-gray-900">Component Preview</h3>
          </div>
          
          {/* Preview Component Selector */}
          <select
            value={previewComponent}
            onChange={(e) => setPreviewComponent(e.target.value)}
            className="px-4 py-2 border border-gray-300 rounded-lg bg-white shadow-sm"
          >
            {previewComponents.map((component) => (
              <option key={component} value={component}>
                {component.charAt(0).toUpperCase() + component.slice(1)}
              </option>
            ))}
          </select>
        </div>

        {/* Preview Content - Full Width */}
        <div className="border border-gray-200 rounded-lg p-8 min-h-[300px] bg-gray-50">
          {renderEditablePreview()}
        </div>
      </div>
    </div>
  );
};

export default ThemeEditor;