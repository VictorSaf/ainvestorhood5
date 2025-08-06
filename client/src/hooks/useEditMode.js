import React, { useState, createContext, useContext, useEffect } from 'react';

const EditModeContext = createContext();

export const EditModeProvider = ({ children }) => {
  const [isGlobalEditMode, setIsGlobalEditMode] = useState(false);
  const [editingComponents, setEditingComponents] = useState(new Set());
  const [componentConfigs, setComponentConfigs] = useState({});

  // Debug log initial state
  useEffect(() => {
    console.log('🎨 EditModeProvider initialized - isGlobalEditMode:', isGlobalEditMode);
  }, []);

  const toggleGlobalEditMode = () => {
    console.log('🎨 toggleGlobalEditMode called - current state:', isGlobalEditMode);
    const newState = !isGlobalEditMode;
    console.log('🎨 Setting new edit mode state to:', newState);
    
    setIsGlobalEditMode(newState);
    
    if (isGlobalEditMode) {
      // Exit edit mode for all components
      console.log('🎨 Exiting edit mode - clearing editing components');
      setEditingComponents(new Set());
    } else {
      console.log('🎨 Entering edit mode');
    }
    
    // Force a re-render by updating state in next tick
    setTimeout(() => {
      console.log('🎨 Edit mode state after toggle:', newState);
    }, 0);
  };

  const startEditingComponent = (componentId) => {
    setEditingComponents(prev => new Set([...prev, componentId]));
  };

  const stopEditingComponent = (componentId) => {
    setEditingComponents(prev => {
      const newSet = new Set(prev);
      newSet.delete(componentId);
      return newSet;
    });
  };

  const isComponentEditing = (componentId) => {
    return editingComponents.has(componentId);
  };

  const updateComponentConfig = (componentId, config) => {
    setComponentConfigs(prev => ({
      ...prev,
      [componentId]: { ...prev[componentId], ...config }
    }));
  };

  const getComponentConfig = (componentId) => {
    return componentConfigs[componentId] || {};
  };

  const forceExitEditMode = () => {
    console.log('Force exiting edit mode');
    setIsGlobalEditMode(false);
    setEditingComponents(new Set());
  };

  const saveAllChanges = async () => {
    try {
      // Save all component configurations to backend
      const response = await fetch('http://localhost:8080/api/components/save', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          components: componentConfigs,
          timestamp: new Date().toISOString()
        }),
      });

      if (response.ok) {
        console.log('All component changes saved successfully');
        // Optionally reset edit states
        setEditingComponents(new Set());
        return true;
      } else {
        console.error('Failed to save component changes');
        return false;
      }
    } catch (error) {
      console.error('Error saving component changes:', error);
      return false;
    }
  };

  const value = {
    isGlobalEditMode,
    editingComponents,
    componentConfigs,
    toggleGlobalEditMode,
    forceExitEditMode,
    startEditingComponent,
    stopEditingComponent,
    isComponentEditing,
    updateComponentConfig,
    getComponentConfig,
    saveAllChanges
  };

  return (
    <EditModeContext.Provider value={value}>
      {children}
    </EditModeContext.Provider>
  );
};

export const useEditMode = () => {
  const context = useContext(EditModeContext);
  if (!context) {
    throw new Error('useEditMode must be used within an EditModeProvider');
  }
  return context;
};