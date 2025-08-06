import React, { useState, useEffect, useRef, useCallback } from 'react';
import { 
  Eye, 
  EyeOff, 
  Search, 
  Code2, 
  Palette, 
  Settings, 
  Target, 
  Monitor,
  Save,
  RefreshCw,
  Copy,
  Check,
  Plus,
  X,
  ChevronDown,
  ChevronRight,
  Layers,
  Zap,
  Info,
  AlertTriangle,
  Filter,
  Download,
  Upload
} from 'lucide-react';
import defaultTheme from '../theme/defaultTheme.json';

const AdvancedCSSEditor = () => {
  // Core state
  const [theme, setTheme] = useState(defaultTheme);
  const [isInspectorActive, setIsInspectorActive] = useState(false);
  const [selectedElement, setSelectedElement] = useState(null);
  const [computedStyles, setComputedStyles] = useState({});
  const [cssRules, setCssRules] = useState([]);
  const [searchQuery, setSearchQuery] = useState('');
  const [activeTab, setActiveTab] = useState('inspector'); // inspector, classes, inheritance, custom
  const [loading, setLoading] = useState(true);
  const [saved, setSaved] = useState(false);
  
  // Inspector state
  const [hoveredElement, setHoveredElement] = useState(null);
  const [inspectorMode, setInspectorMode] = useState('hover'); // hover, click
  const [showComputedOnly, setShowComputedOnly] = useState(false);
  const [groupByCategory, setGroupByCategory] = useState(true);
  
  // CSS editing state
  const [editingProperty, setEditingProperty] = useState(null);
  const [propertyValue, setPropertyValue] = useState('');
  const [customCSS, setCustomCSS] = useState('');
  const [cssClasses, setCssClasses] = useState([]);
  const [expandedGroups, setExpandedGroups] = useState(new Set(['layout', 'typography', 'colors']));
  const [selectedClass, setSelectedClass] = useState(null);
  const [classStyles, setClassStyles] = useState({});
  
  // Live style injection state
  const [injectedStyles, setInjectedStyles] = useState(new Map());
  const styleSheetRef = useRef(null);
  
  useEffect(() => {
    initializeEditor();
    return () => {
      if (styleSheetRef.current) {
        document.head.removeChild(styleSheetRef.current);
      }
    };
  }, []);

  const initializeEditor = async () => {
    try {
      // Load theme from database
      await loadThemeFromDatabase();
      
      // Initialize live CSS injection
      initializeLiveCSS();
      
      // Extract existing CSS classes
      extractCSSClasses();
      
      setLoading(false);
    } catch (error) {
      console.error('Failed to initialize CSS editor:', error);
      setLoading(false);
    }
  };

  const loadThemeFromDatabase = async () => {
    try {
      const response = await fetch('http://localhost:8080/api/theme');
      if (response.ok) {
        const savedTheme = await response.json();
        setTheme(savedTheme);
      }
    } catch (error) {
      console.error('Failed to load theme from database:', error);
    }
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
      setSaved(true);
      setTimeout(() => setSaved(false), 2000);
    } catch (error) {
      console.error('Failed to save theme to database:', error);
    }
  };

  const initializeLiveCSS = () => {
    // Create a style element for live CSS injection
    const styleElement = document.createElement('style');
    styleElement.setAttribute('id', 'advanced-css-editor-live-styles');
    document.head.appendChild(styleElement);
    styleSheetRef.current = styleElement;
  };

  const extractCSSClasses = () => {
    // Extract CSS classes from existing stylesheets
    const classes = new Set();
    
    try {
      for (const styleSheet of document.styleSheets) {
        try {
          const rules = styleSheet.cssRules || styleSheet.rules;
          for (const rule of rules) {
            if (rule.type === CSSRule.STYLE_RULE) {
              const selectors = rule.selectorText.split(',');
              selectors.forEach(selector => {
                const classMatches = selector.match(/\.[a-zA-Z][\w-]*/g);
                if (classMatches) {
                  classMatches.forEach(match => classes.add(match.slice(1)));
                }
              });
            }
          }
        } catch (e) {
          // Skip cross-origin stylesheets
          console.warn('Cannot access stylesheet:', styleSheet.href);
        }
      }
      
      setCssClasses(Array.from(classes).sort());
    } catch (error) {
      console.error('Failed to extract CSS classes:', error);
    }
  };

  const injectLiveCSS = (selector, property, value) => {
    const key = `${selector}-${property}`;
    const newInjected = new Map(injectedStyles);
    newInjected.set(key, { selector, property, value });
    setInjectedStyles(newInjected);

    // Update the live style sheet
    updateLiveStyleSheet(newInjected);
  };

  const updateLiveStyleSheet = (styles) => {
    if (!styleSheetRef.current) return;

    // Group styles by selector
    const selectorMap = new Map();
    styles.forEach(({ selector, property, value }) => {
      if (!selectorMap.has(selector)) {
        selectorMap.set(selector, []);
      }
      selectorMap.get(selector).push(`${property}: ${value}`);
    });

    // Generate CSS text
    let cssText = '';
    selectorMap.forEach((properties, selector) => {
      cssText += `${selector} { ${properties.join('; ')}; }\n`;
    });

    styleSheetRef.current.textContent = cssText;
  };

  const handleElementInspection = useCallback((event) => {
    if (!isInspectorActive) return;

    event.preventDefault();
    event.stopPropagation();

    const element = event.target;
    
    if (inspectorMode === 'hover') {
      setHoveredElement(element);
    } else {
      setSelectedElement(element);
      inspectElement(element);
    }
  }, [isInspectorActive, inspectorMode]);

  const inspectElement = (element) => {
    if (!element) return;

    const computed = window.getComputedStyle(element);
    const computedObj = {};
    
    // Get all computed styles
    for (let i = 0; i < computed.length; i++) {
      const property = computed[i];
      computedObj[property] = computed.getPropertyValue(property);
    }

    setComputedStyles(computedObj);
    
    // Get CSS rules that apply to this element
    const rules = [];
    try {
      for (const styleSheet of document.styleSheets) {
        try {
          const cssRules = styleSheet.cssRules || styleSheet.rules;
          for (const rule of cssRules) {
            if (rule.type === CSSRule.STYLE_RULE) {
              if (element.matches && element.matches(rule.selectorText)) {
                rules.push({
                  selector: rule.selectorText,
                  cssText: rule.cssText,
                  styleSheet: styleSheet.href || 'inline'
                });
              }
            }
          }
        } catch (e) {
          // Skip cross-origin stylesheets
        }
      }
    } catch (error) {
      console.error('Failed to get CSS rules:', error);
    }

    setCssRules(rules);
  };

  const categorizeProperties = (styles) => {
    const categories = {
      layout: ['display', 'position', 'top', 'right', 'bottom', 'left', 'float', 'clear', 'z-index', 'width', 'height', 'min-width', 'max-width', 'min-height', 'max-height', 'margin', 'margin-top', 'margin-right', 'margin-bottom', 'margin-left', 'padding', 'padding-top', 'padding-right', 'padding-bottom', 'padding-left'],
      typography: ['font-family', 'font-size', 'font-weight', 'font-style', 'line-height', 'letter-spacing', 'text-align', 'text-decoration', 'text-transform', 'white-space', 'word-wrap', 'word-break'],
      colors: ['color', 'background-color', 'background', 'background-image', 'background-size', 'background-position', 'background-repeat', 'opacity', 'box-shadow', 'text-shadow'],
      border: ['border', 'border-width', 'border-style', 'border-color', 'border-radius', 'border-top', 'border-right', 'border-bottom', 'border-left', 'outline'],
      flexbox: ['flex', 'flex-direction', 'flex-wrap', 'justify-content', 'align-items', 'align-content', 'flex-grow', 'flex-shrink', 'flex-basis', 'align-self', 'order'],
      animation: ['transition', 'transform', 'animation', 'animation-name', 'animation-duration', 'animation-timing-function', 'animation-delay', 'animation-iteration-count']
    };

    const categorized = {};
    const uncategorized = {};

    Object.entries(styles).forEach(([property, value]) => {
      let found = false;
      for (const [category, properties] of Object.entries(categories)) {
        if (properties.includes(property)) {
          if (!categorized[category]) categorized[category] = {};
          categorized[category][property] = value;
          found = true;
          break;
        }
      }
      if (!found) {
        uncategorized[property] = value;
      }
    });

    if (Object.keys(uncategorized).length > 0) {
      categorized.other = uncategorized;
    }

    return categorized;
  };

  const handlePropertyEdit = (property, value) => {
    if (!selectedElement) return;

    setEditingProperty(property);
    setPropertyValue(value);
  };

  const savePropertyEdit = () => {
    if (!selectedElement || !editingProperty) return;

    // Validate the CSS value
    if (!validateCSSValue(editingProperty, propertyValue)) {
      alert(`Invalid CSS value for ${editingProperty}: ${propertyValue}`);
      return;
    }

    try {
      // Apply the style directly to the element
      selectedElement.style[editingProperty] = propertyValue;
      
      // Also inject as CSS rule for persistence
      const selector = generateSelectorForElement(selectedElement);
      injectLiveCSS(selector, editingProperty, propertyValue);

      // Update computed styles
      inspectElement(selectedElement);

      setEditingProperty(null);
      setPropertyValue('');
    } catch (error) {
      alert(`Error applying CSS: ${error.message}`);
    }
  };

  const validateCSSValue = (property, value) => {
    // Basic CSS value validation
    const validations = {
      'color': /^(#[0-9a-f]{3,8}|rgba?\([^)]+\)|hsla?\([^)]+\)|[a-z]+)$/i,
      'background-color': /^(#[0-9a-f]{3,8}|rgba?\([^)]+\)|hsla?\([^)]+\)|[a-z]+|transparent)$/i,
      'width': /^(auto|\d+(\.\d+)?(px|em|rem|%|vw|vh|vmin|vmax))$/i,
      'height': /^(auto|\d+(\.\d+)?(px|em|rem|%|vw|vh|vmin|vmax))$/i,
      'margin': /^(-?\d+(\.\d+)?(px|em|rem|%)|auto)(\s+(-?\d+(\.\d+)?(px|em|rem|%)|auto)){0,3}$/i,
      'padding': /^(\d+(\.\d+)?(px|em|rem|%))(\s+\d+(\.\d+)?(px|em|rem|%)){0,3}$/i,
      'font-size': /^(\d+(\.\d+)?(px|em|rem|pt|%))$/i,
      'opacity': /^(0(\.\d+)?|1(\.0+)?)$/,
      'z-index': /^(-?\d+|auto)$/,
      'border-radius': /^(\d+(\.\d+)?(px|em|rem|%))(\s+\d+(\.\d+)?(px|em|rem|%)){0,3}$/i,
    };

    // Check for specific property validations
    if (validations[property]) {
      return validations[property].test(value.trim());
    }

    // Generic validation - not empty and reasonable length
    return value.trim().length > 0 && value.trim().length < 200;
  };

  const generateSelectorForElement = (element) => {
    // Generate a more specific and unique CSS selector
    const path = [];
    let current = element;
    
    while (current && current !== document.body) {
      let selector = current.tagName.toLowerCase();
      
      // Prefer ID if available (most specific)
      if (current.id) {
        path.unshift(`#${current.id}`);
        break; // ID is unique, no need to go further up
      }
      
      // Use classes if available
      if (current.className && typeof current.className === 'string') {
        const classes = current.className.split(' ')
          .filter(cls => cls.trim() && !cls.includes('hover:') && !cls.includes('focus:'))
          .slice(0, 3); // Limit to 3 classes to avoid overly specific selectors
        
        if (classes.length > 0) {
          selector += '.' + classes.join('.');
        }
      }
      
      // Add nth-child if there are siblings with same tag
      const siblings = current.parentElement ? 
        Array.from(current.parentElement.children).filter(el => el.tagName === current.tagName) : [];
      
      if (siblings.length > 1) {
        const index = siblings.indexOf(current) + 1;
        selector += `:nth-child(${index})`;
      }
      
      path.unshift(selector);
      current = current.parentElement;
      
      // Limit depth to avoid overly complex selectors
      if (path.length >= 4) break;
    }
    
    return path.join(' > ');
  };

  const PropertyEditor = ({ property, value, isEditing = false }) => {
    const isColorProperty = property.includes('color') || property.includes('Color') || property === 'background' || property === 'border-color' || property === 'box-shadow';
    const isValidValue = validateCSSValue(property, propertyValue || value);
    
    return (
      <div className="flex items-center justify-between p-2 hover:bg-gray-50 rounded group">
        <div className="flex items-center space-x-2 flex-1">
          <span className="text-sm font-mono text-blue-600 min-w-0 flex-shrink-0">
            {property}:
          </span>
          {isEditing && editingProperty === property ? (
            <div className="flex items-center space-x-2 flex-1">
              <div className="flex items-center space-x-1 flex-1">
                {isColorProperty && (
                  <input
                    type="color"
                    value={propertyValue.startsWith('#') ? propertyValue : '#000000'}
                    onChange={(e) => setPropertyValue(e.target.value)}
                    className="w-8 h-6 rounded border border-gray-300 cursor-pointer"
                    title="Color picker"
                  />
                )}
                <input
                  type="text"
                  value={propertyValue}
                  onChange={(e) => setPropertyValue(e.target.value)}
                  className={`flex-1 px-2 py-1 text-sm border rounded focus:outline-none focus:ring-1 ${
                    !isValidValue 
                      ? 'border-red-300 focus:ring-red-500 bg-red-50' 
                      : 'border-gray-300 focus:ring-blue-500'
                  }`}
                  onKeyPress={(e) => {
                    if (e.key === 'Enter') savePropertyEdit();
                    if (e.key === 'Escape') setEditingProperty(null);
                  }}
                  autoFocus
                />
              </div>
              <div className="flex items-center space-x-1">
                {!isValidValue && (
                  <AlertTriangle size={14} className="text-red-500" title="Invalid CSS value" />
                )}
                <button
                  onClick={savePropertyEdit}
                  className={`p-1 rounded ${
                    isValidValue 
                      ? 'text-green-600 hover:bg-green-50' 
                      : 'text-gray-400 cursor-not-allowed'
                  }`}
                  disabled={!isValidValue}
                >
                  <Check size={14} />
                </button>
                <button
                  onClick={() => setEditingProperty(null)}
                  className="p-1 text-gray-400 hover:bg-gray-50 rounded"
                >
                  <X size={14} />
                </button>
              </div>
            </div>
          ) : (
            <div className="flex items-center space-x-2 flex-1">
              {isColorProperty && value.startsWith('#') && (
                <div
                  className="w-4 h-4 rounded border border-gray-300"
                  style={{ backgroundColor: value }}
                  title={`Color: ${value}`}
                />
              )}
              <span 
                className="text-sm font-mono text-gray-700 flex-1 cursor-pointer hover:bg-yellow-50 px-1 rounded"
                onClick={() => handlePropertyEdit(property, value)}
                title="Click to edit"
              >
                {value}
              </span>
            </div>
          )}
        </div>
      </div>
    );
  };

  const PropertyGroup = ({ title, properties, expanded, onToggle }) => (
    <div className="border border-gray-200 rounded-lg mb-2">
      <button
        onClick={onToggle}
        className="w-full flex items-center justify-between p-3 bg-gray-50 hover:bg-gray-100 rounded-t-lg"
      >
        <span className="font-medium text-gray-700">{title}</span>
        <div className="flex items-center space-x-2">
          <span className="text-xs text-gray-500">{Object.keys(properties).length} properties</span>
          {expanded ? <ChevronDown size={16} /> : <ChevronRight size={16} />}
        </div>
      </button>
      {expanded && (
        <div className="border-t border-gray-200">
          {Object.entries(properties).map(([property, value]) => (
            <PropertyEditor
              key={property}
              property={property}
              value={value}
              isEditing={selectedElement && editingProperty === property}
            />
          ))}
        </div>
      )}
    </div>
  );

  const renderInspectorTab = () => (
    <div className="space-y-4">
      {/* Inspector Controls */}
      <div className="bg-white rounded-lg border p-4">
        <div className="flex items-center justify-between mb-4">
          <div className="flex items-center space-x-2">
            <Target size={20} className="text-blue-600" />
            <h3 className="font-semibold text-gray-900">Element Inspector</h3>
          </div>
          <div className="flex items-center space-x-2">
            <button
              onClick={() => setInspectorMode(inspectorMode === 'hover' ? 'click' : 'hover')}
              className={`px-3 py-1 text-xs rounded-full ${
                inspectorMode === 'hover' 
                  ? 'bg-blue-100 text-blue-700' 
                  : 'bg-purple-100 text-purple-700'
              }`}
            >
              {inspectorMode.charAt(0).toUpperCase() + inspectorMode.slice(1)} Mode
            </button>
            <button
              onClick={() => setIsInspectorActive(!isInspectorActive)}
              className={`flex items-center space-x-2 px-4 py-2 rounded-lg font-medium transition-colors ${
                isInspectorActive
                  ? 'bg-red-600 text-white hover:bg-red-700'
                  : 'bg-blue-600 text-white hover:bg-blue-700'
              }`}
            >
              {isInspectorActive ? <EyeOff size={16} /> : <Eye size={16} />}
              <span>{isInspectorActive ? 'Stop Inspector' : 'Start Inspector'}</span>
            </button>
          </div>
        </div>

        {isInspectorActive && (
          <div className="bg-blue-50 border border-blue-200 rounded-lg p-3">
            <div className="flex items-center space-x-2 text-blue-800 text-sm">
              <Info size={16} />
              <span>
                {inspectorMode === 'hover' 
                  ? 'Move your mouse over elements to inspect them'
                  : 'Click on any element to inspect its styles'
                }
              </span>
            </div>
          </div>
        )}
      </div>

      {/* Selected Element Info */}
      {selectedElement && (
        <div className="bg-white rounded-lg border">
          <div className="p-4 border-b bg-gray-50">
            <div className="flex items-center justify-between">
              <div>
                <h4 className="font-semibold text-gray-900">
                  {selectedElement.tagName.toLowerCase()}
                  {selectedElement.id && <span className="text-blue-600">#{selectedElement.id}</span>}
                  {selectedElement.className && (
                    <span className="text-purple-600 ml-1">
                      .{selectedElement.className.split(' ').join('.')}
                    </span>
                  )}
                </h4>
                <p className="text-sm text-gray-600 mt-1">
                  {Object.keys(computedStyles).length} computed styles
                </p>
              </div>
              <div className="flex items-center space-x-2">
                <button
                  onClick={() => setShowComputedOnly(!showComputedOnly)}
                  className={`px-3 py-1 text-xs rounded-full ${
                    showComputedOnly 
                      ? 'bg-green-100 text-green-700' 
                      : 'bg-gray-100 text-gray-700'
                  }`}
                >
                  {showComputedOnly ? 'All Styles' : 'Computed Only'}
                </button>
                <button
                  onClick={() => setGroupByCategory(!groupByCategory)}
                  className={`px-3 py-1 text-xs rounded-full ${
                    groupByCategory 
                      ? 'bg-blue-100 text-blue-700' 
                      : 'bg-gray-100 text-gray-700'
                  }`}
                >
                  <Layers size={12} className="inline mr-1" />
                  {groupByCategory ? 'Grouped' : 'List'}
                </button>
              </div>
            </div>
          </div>

          {/* CSS Properties */}
          <div className="p-4">
            {groupByCategory ? (
              <div className="space-y-2">
                {Object.entries(categorizeProperties(computedStyles)).map(([category, properties]) => (
                  <PropertyGroup
                    key={category}
                    title={category.charAt(0).toUpperCase() + category.slice(1)}
                    properties={properties}
                    expanded={expandedGroups.has(category)}
                    onToggle={() => {
                      const newExpanded = new Set(expandedGroups);
                      if (newExpanded.has(category)) {
                        newExpanded.delete(category);
                      } else {
                        newExpanded.add(category);
                      }
                      setExpandedGroups(newExpanded);
                    }}
                  />
                ))}
              </div>
            ) : (
              <div className="space-y-1 max-h-96 overflow-y-auto">
                {Object.entries(computedStyles)
                  .filter(([property]) => 
                    property.toLowerCase().includes(searchQuery.toLowerCase())
                  )
                  .map(([property, value]) => (
                    <PropertyEditor
                      key={property}
                      property={property}
                      value={value}
                      isEditing={editingProperty === property}
                    />
                  ))}
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );

  const getClassStyles = (className) => {
    const styles = {};
    try {
      for (const styleSheet of document.styleSheets) {
        try {
          const rules = styleSheet.cssRules || styleSheet.rules;
          for (const rule of rules) {
            if (rule.type === CSSRule.STYLE_RULE && rule.selectorText.includes(`.${className}`)) {
              for (let i = 0; i < rule.style.length; i++) {
                const property = rule.style[i];
                styles[property] = rule.style.getPropertyValue(property);
              }
            }
          }
        } catch (e) {
          // Skip cross-origin stylesheets
        }
      }
    } catch (error) {
      console.error('Error getting class styles:', error);
    }
    return styles;
  };

  const handleClassClick = (className) => {
    setSelectedClass(className);
    setClassStyles(getClassStyles(className));
  };

  const renderClassBrowser = () => {

    return (
      <div className="space-y-4">
        <div className="bg-white rounded-lg border">
          <div className="p-4 border-b bg-gray-50">
            <div className="flex items-center justify-between">
              <div className="flex items-center space-x-2">
                <Code2 size={20} className="text-purple-600" />
                <h3 className="font-semibold text-gray-900">CSS Class Browser</h3>
              </div>
              <div className="flex items-center space-x-2">
                <div className="relative">
                  <Search size={16} className="absolute left-3 top-1/2 transform -translate-y-1/2 text-gray-400" />
                  <input
                    type="text"
                    placeholder="Search classes..."
                    value={searchQuery}
                    onChange={(e) => setSearchQuery(e.target.value)}
                    className="pl-9 pr-4 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-1 focus:ring-blue-500"
                  />
                </div>
              </div>
            </div>
          </div>

          <div className="grid md:grid-cols-2 gap-0">
            {/* Class List */}
            <div className="p-4 border-r">
              <h4 className="font-medium text-gray-700 mb-3">Available Classes ({cssClasses.length})</h4>
              <div className="space-y-1 max-h-96 overflow-y-auto">
                {cssClasses
                  .filter(className => 
                    className.toLowerCase().includes(searchQuery.toLowerCase())
                  )
                  .map(className => (
                    <button
                      key={className}
                      onClick={() => handleClassClick(className)}
                      className={`w-full p-2 text-left text-sm border rounded transition-colors font-mono ${
                        selectedClass === className
                          ? 'border-blue-300 bg-blue-50 text-blue-700'
                          : 'border-gray-200 hover:bg-blue-50 hover:border-blue-300'
                      }`}
                    >
                      .{className}
                    </button>
                  ))}
              </div>
            </div>

            {/* Class Styles */}
            <div className="p-4">
              {selectedClass ? (
                <div>
                  <h4 className="font-medium text-gray-700 mb-3">
                    Styles for .{selectedClass}
                  </h4>
                  {Object.keys(classStyles).length > 0 ? (
                    <div className="space-y-1 max-h-96 overflow-y-auto">
                      {Object.entries(classStyles).map(([property, value]) => (
                        <div key={property} className="flex items-center justify-between p-2 hover:bg-gray-50 rounded">
                          <span className="text-sm font-mono text-blue-600">{property}:</span>
                          <span className="text-sm font-mono text-gray-700 ml-2">{value}</span>
                        </div>
                      ))}
                    </div>
                  ) : (
                    <p className="text-gray-500 text-sm">No styles found for this class</p>
                  )}
                </div>
              ) : (
                <div className="text-center text-gray-500 py-8">
                  <Code2 size={48} className="mx-auto mb-4 text-gray-300" />
                  <p>Select a class to view its styles</p>
                </div>
              )}
            </div>
          </div>
        </div>
      </div>
    );
  };

  const renderCustomCSS = () => (
    <div className="space-y-4">
      <div className="bg-white rounded-lg border">
        <div className="p-4 border-b bg-gray-50">
          <div className="flex items-center justify-between">
            <div className="flex items-center space-x-2">
              <Zap size={20} className="text-yellow-600" />
              <h3 className="font-semibold text-gray-900">Custom CSS Rules</h3>
            </div>
            <button
              onClick={() => {
                const newCSS = customCSS.trim();
                if (newCSS) {
                  // Inject custom CSS
                  const customStyleElement = document.createElement('style');
                  customStyleElement.textContent = newCSS;
                  document.head.appendChild(customStyleElement);
                  
                  // Update theme with custom CSS
                  const updatedTheme = {
                    ...theme,
                    customCSS: [...(theme.customCSS || []), newCSS]
                  };
                  setTheme(updatedTheme);
                  saveThemeToDatabase(updatedTheme);
                  setCustomCSS('');
                }
              }}
              className="flex items-center space-x-2 px-4 py-2 bg-green-600 text-white rounded-lg hover:bg-green-700 transition-colors font-medium"
            >
              <Plus size={16} />
              <span>Apply CSS</span>
            </button>
          </div>
        </div>

        <div className="p-4">
          <textarea
            value={customCSS}
            onChange={(e) => setCustomCSS(e.target.value)}
            placeholder="Enter your custom CSS rules here...

Example:
.my-custom-class {
  background: linear-gradient(45deg, #ff6b6b, #4ecdc4);
  padding: 1rem;
  border-radius: 8px;
}

#my-element {
  font-weight: bold;
  color: #333;
}"
            className="w-full h-64 px-3 py-2 font-mono text-sm border border-gray-300 rounded-lg focus:outline-none focus:ring-1 focus:ring-blue-500 resize-none"
          />
        </div>
      </div>

      {/* Live Injected Styles */}
      {injectedStyles.size > 0 && (
        <div className="bg-white rounded-lg border">
          <div className="p-4 border-b bg-gray-50">
            <div className="flex items-center justify-between">
              <h4 className="font-semibold text-gray-900">Live Injected Styles</h4>
              <button
                onClick={() => {
                  setInjectedStyles(new Map());
                  updateLiveStyleSheet(new Map());
                }}
                className="text-sm text-red-600 hover:text-red-700"
              >
                Clear All
              </button>
            </div>
          </div>
          <div className="p-4 space-y-2 max-h-48 overflow-y-auto">
            {Array.from(injectedStyles.entries()).map(([key, { selector, property, value }]) => (
              <div key={key} className="flex items-center justify-between p-2 bg-gray-50 rounded">
                <span className="font-mono text-sm">
                  <span className="text-blue-600">{selector}</span>{' '}
                  <span className="text-gray-600">{'{'}</span>{' '}
                  <span className="text-purple-600">{property}</span>:{' '}
                  <span className="text-green-600">{value}</span>{' '}
                  <span className="text-gray-600">{'}'}</span>
                </span>
                <button
                  onClick={() => {
                    const newInjected = new Map(injectedStyles);
                    newInjected.delete(key);
                    setInjectedStyles(newInjected);
                    updateLiveStyleSheet(newInjected);
                  }}
                  className="text-red-500 hover:text-red-700"
                >
                  <X size={14} />
                </button>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );

  // Attach event listeners for inspection
  useEffect(() => {
    if (isInspectorActive) {
      const handleMouseMove = (e) => {
        if (inspectorMode === 'hover') {
          handleElementInspection(e);
        }
      };

      const handleClick = (e) => {
        if (inspectorMode === 'click') {
          handleElementInspection(e);
        }
      };

      document.addEventListener('mousemove', handleMouseMove);
      document.addEventListener('click', handleClick, true);

      return () => {
        document.removeEventListener('mousemove', handleMouseMove);
        document.removeEventListener('click', handleClick, true);
      };
    }
  }, [isInspectorActive, handleElementInspection, inspectorMode]);

  const tabs = [
    { id: 'inspector', name: 'Element Inspector', icon: Target, description: 'Inspect and edit element styles' },
    { id: 'classes', name: 'Class Browser', icon: Code2, description: 'Browse all CSS classes' },
    { id: 'custom', name: 'Custom CSS', icon: Zap, description: 'Add custom CSS rules' },
    { id: 'inheritance', name: 'Style Inheritance', icon: Layers, description: 'View style cascade' }
  ];

  if (loading) {
    return (
      <div className="flex items-center justify-center py-12">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-500"></div>
        <span className="ml-3 text-gray-600">Loading advanced CSS editor...</span>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="bg-white rounded-lg shadow p-6">
        <div className="flex items-center justify-between mb-4">
          <div className="flex items-center space-x-3">
            <div className="inline-flex items-center justify-center w-10 h-10 bg-gradient-to-br from-blue-500 to-purple-600 rounded-lg">
              <Monitor size={20} className="text-white" />
            </div>
            <div>
              <h2 className="text-xl font-bold text-gray-900">Advanced CSS Editor</h2>
              <p className="text-gray-600">Inspect, edit, and customize CSS with real-time preview</p>
            </div>
          </div>
          
          <div className="flex items-center space-x-2">
            <button
              onClick={() => navigator.clipboard.writeText(JSON.stringify(theme, null, 2))}
              className="flex items-center space-x-2 px-3 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors"
            >
              {saved ? <Check size={16} /> : <Copy size={16} />}
              <span>Export</span>
            </button>
            <button
              onClick={() => window.location.reload()}
              className="flex items-center space-x-2 px-3 py-2 bg-gray-600 text-white rounded-lg hover:bg-gray-700 transition-colors"
            >
              <RefreshCw size={16} />
              <span>Reset</span>
            </button>
          </div>
        </div>

        {/* Status Bar */}
        <div className="bg-gray-50 rounded-lg p-4">
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4 text-sm">
            <div>
              <span className="text-gray-600">Inspector:</span>
              <p className="font-medium text-green-600">
                {isInspectorActive ? 'Active' : 'Inactive'}
              </p>
            </div>
            <div>
              <span className="text-gray-600">Selected Element:</span>
              <p className="font-medium">
                {selectedElement ? selectedElement.tagName.toLowerCase() : 'None'}
              </p>
            </div>
            <div>
              <span className="text-gray-600">CSS Classes:</span>
              <p className="font-medium">{cssClasses.length}</p>
            </div>
            <div>
              <span className="text-gray-600">Live Styles:</span>
              <p className="font-medium">{injectedStyles.size}</p>
            </div>
          </div>
        </div>
      </div>

      {/* Tab Navigation */}
      <div className="bg-white rounded-lg shadow border-b">
        <nav className="flex space-x-6 px-6">
          {tabs.map((tab) => (
            <button
              key={tab.id}
              onClick={() => setActiveTab(tab.id)}
              className={`py-4 px-1 border-b-2 font-medium text-sm flex items-center space-x-2 ${
                activeTab === tab.id
                  ? 'border-blue-500 text-blue-600'
                  : 'border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300'
              }`}
              title={tab.description}
            >
              <tab.icon size={16} />
              <span>{tab.name}</span>
            </button>
          ))}
        </nav>
      </div>

      {/* Tab Content */}
      <div className="min-h-[600px]">
        {activeTab === 'inspector' && renderInspectorTab()}
        {activeTab === 'classes' && renderClassBrowser()}
        {activeTab === 'custom' && renderCustomCSS()}
        {activeTab === 'inheritance' && (
          <div className="bg-white rounded-lg border p-8 text-center text-gray-500">
            <Layers size={48} className="mx-auto mb-4 text-gray-300" />
            <h3 className="text-lg font-medium mb-2">Style Inheritance Viewer</h3>
            <p>This feature will show CSS cascade and inheritance tree</p>
            <p className="text-sm mt-2">Coming in next iteration...</p>
          </div>
        )}
      </div>
    </div>
  );
};

export default AdvancedCSSEditor;