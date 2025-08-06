import React, { useState, useEffect, useRef } from 'react';
import { Edit3, Save, X, Plus, Trash2, Type, Palette, Layout, Settings } from 'lucide-react';
import { useEditMode } from '../hooks/useEditMode';

const EditableComponent = ({ 
  children, 
  componentName,
  onSave,
  allowAddElements = true,
  allowDeleteElements = true,
  editableProps = [],
  className = ''
}) => {
  const { isGlobalEditMode, isComponentEditing, startEditingComponent, stopEditingComponent } = useEditMode();
  
  // Individual component editing state - only active when global edit mode is on
  const isEditing = isGlobalEditMode && isComponentEditing(componentName);
  const [editedProps, setEditedProps] = useState({});
  const [selectedElement, setSelectedElement] = useState(null);
  const [showAddMenu, setShowAddMenu] = useState(false);
  const containerRef = useRef(null);

  // Available element types for adding new elements
  const elementTypes = [
    { type: 'text', name: 'Text', icon: Type, defaultProps: { children: 'New Text', className: 'text-gray-900' } },
    { type: 'button', name: 'Button', icon: Settings, defaultProps: { children: 'New Button', variant: 'primary' } },
    { type: 'div', name: 'Container', icon: Layout, defaultProps: { className: 'p-4 border rounded-lg' } },
    { type: 'badge', name: 'Badge', icon: Palette, defaultProps: { children: 'New Badge', variant: 'primary' } }
  ];

  useEffect(() => {
    const handleClickOutside = (event) => {
      if (containerRef.current && !containerRef.current.contains(event.target)) {
        setSelectedElement(null);
        setShowAddMenu(false);
      }
    };

    if (isEditing) {
      document.addEventListener('mousedown', handleClickOutside);
      return () => document.removeEventListener('mousedown', handleClickOutside);
    }
  }, [isEditing]);

  // Clean up component editing state when global edit mode is disabled
  useEffect(() => {
    if (!isGlobalEditMode) {
      setSelectedElement(null);
      setShowAddMenu(false);
      setEditedProps({});
    }
  }, [isGlobalEditMode]);

  const handleEditClick = () => {
    if (!isGlobalEditMode) return; // Only allow editing when global edit mode is active
    
    startEditingComponent(componentName);
    // Initialize edited props with current component props
    const initialProps = {};
    editableProps.forEach(prop => {
      if (children.props && children.props[prop] !== undefined) {
        initialProps[prop] = children.props[prop];
      }
    });
    setEditedProps(initialProps);
  };

  const handleSave = () => {
    if (onSave) {
      onSave(editedProps);
    }
    stopEditingComponent(componentName);
    setSelectedElement(null);
    setEditedProps({});
  };

  const handleCancel = () => {
    stopEditingComponent(componentName);
    setSelectedElement(null);
    setEditedProps({});
  };

  const handlePropChange = (propName, value) => {
    setEditedProps(prev => ({
      ...prev,
      [propName]: value
    }));
  };

  const handleElementClick = (event, elementId) => {
    if (!isEditing) return;
    event.stopPropagation();
    setSelectedElement(elementId);
    setShowAddMenu(false);
  };

  const addNewElement = (elementType) => {
    const newElement = {
      id: `new-${Date.now()}`,
      type: elementType.type,
      props: elementType.defaultProps
    };
    
    // This would need to be implemented based on your component structure
    // For now, just close the menu
    setShowAddMenu(false);
    console.log('Adding new element:', newElement);
  };

  const deleteElement = (elementId) => {
    // This would need to be implemented based on your component structure
    console.log('Deleting element:', elementId);
    setSelectedElement(null);
  };

  const renderEditControls = () => (
    isGlobalEditMode && (
      <div className="absolute top-2 right-2 flex items-center gap-2 z-50">
        {isEditing ? (
          <>
            <button
              onClick={handleSave}
              className="flex items-center gap-1 px-3 py-1 bg-green-600 text-white rounded-md hover:bg-green-700 transition-colors text-sm font-medium"
            >
              <Save size={14} />
              Save
            </button>
            <button
              onClick={handleCancel}
              className="flex items-center gap-1 px-3 py-1 bg-gray-600 text-white rounded-md hover:bg-gray-700 transition-colors text-sm font-medium"
            >
              <X size={14} />
              Cancel
            </button>
          </>
        ) : (
          <button
            onClick={handleEditClick}
            className="flex items-center gap-1 px-3 py-1 bg-blue-600 text-white rounded-md hover:bg-blue-700 transition-colors text-sm font-medium opacity-0 group-hover:opacity-100 transition-opacity"
          >
            <Edit3 size={14} />
            Edit
          </button>
        )}
      </div>
    )
  );

  const renderAddButton = () => (
    allowAddElements && isEditing && (
      <div className="relative">
        <button
          onClick={() => setShowAddMenu(!showAddMenu)}
          className="absolute bottom-2 left-2 flex items-center gap-1 px-3 py-1 bg-purple-600 text-white rounded-md hover:bg-purple-700 transition-colors text-sm font-medium z-40"
        >
          <Plus size={14} />
          Add Element
        </button>
        
        {showAddMenu && (
          <div className="absolute bottom-10 left-2 bg-white border border-gray-200 rounded-lg shadow-lg z-50 p-2 min-w-48">
            <div className="text-xs font-medium text-gray-700 mb-2 px-2">Add New Element:</div>
            {elementTypes.map((elementType) => (
              <button
                key={elementType.type}
                onClick={() => addNewElement(elementType)}
                className="w-full flex items-center gap-2 px-3 py-2 text-sm text-gray-700 hover:bg-gray-100 rounded-md transition-colors"
              >
                <elementType.icon size={16} />
                {elementType.name}
              </button>
            ))}
          </div>
        )}
      </div>
    )
  );

  const renderPropertyEditor = () => (
    isEditing && (
      <div className="absolute top-12 right-2 bg-white border border-gray-200 rounded-lg shadow-lg z-50 p-4 min-w-64">
        <div className="text-sm font-medium text-gray-700 mb-3">
          Edit {componentName} Properties
        </div>
        
        {editableProps.map((prop) => (
          <div key={prop} className="mb-3">
            <label className="block text-xs font-medium text-gray-600 mb-1">
              {prop.charAt(0).toUpperCase() + prop.slice(1)}
            </label>
            <input
              type="text"
              value={editedProps[prop] || children.props?.[prop] || ''}
              onChange={(e) => handlePropChange(prop, e.target.value)}
              className="w-full px-3 py-2 border border-gray-300 rounded-md text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
              placeholder={`Enter ${prop}...`}
            />
          </div>
        ))}
        
        {selectedElement && allowDeleteElements && (
          <div className="mt-4 pt-3 border-t border-gray-200">
            <button
              onClick={() => deleteElement(selectedElement)}
              className="flex items-center gap-1 px-3 py-1 bg-red-600 text-white rounded-md hover:bg-red-700 transition-colors text-sm font-medium w-full justify-center"
            >
              <Trash2 size={14} />
              Delete Selected
            </button>
          </div>
        )}
      </div>
    )
  );

  // Clone children with enhanced props for editing mode
  const enhancedChildren = isEditing ? 
    React.cloneElement(children, {
      ...children.props,
      ...editedProps,
      onClick: (e) => handleElementClick(e, 'main'),
      className: `${children.props?.className || ''} ${selectedElement === 'main' ? 'ring-2 ring-blue-500 ring-opacity-50' : ''}`
    }) : children;

  return (
    <div 
      ref={containerRef}
      className={`group relative ${className} ${isEditing ? 'editing-mode' : ''}`}
    >
      {enhancedChildren}
      {renderEditControls()}
      {renderAddButton()}
      {renderPropertyEditor()}
      
      {/* Edit mode overlay - only show when global edit mode is active */}
      {isGlobalEditMode && isEditing && (
        <div className="absolute inset-0 border-2 border-dashed border-blue-400 pointer-events-none rounded-lg"></div>
      )}
      
      {/* Component label - only show when global edit mode is active */}
      {isGlobalEditMode && isEditing && (
        <div className="absolute top-0 left-0 bg-blue-600 text-white px-2 py-1 text-xs font-medium rounded-tl-lg rounded-br-lg">
          {componentName}
        </div>
      )}
      
      {/* Show subtle hover effect when global edit mode is active but component not being edited */}
      {isGlobalEditMode && !isEditing && (
        <div className="absolute inset-0 border border-dashed border-gray-300 opacity-0 group-hover:opacity-100 pointer-events-none rounded-lg transition-opacity"></div>
      )}
    </div>
  );
};

export default EditableComponent;