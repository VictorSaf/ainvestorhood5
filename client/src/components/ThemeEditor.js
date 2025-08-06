import React, { useState, useEffect } from 'react';
import defaultTheme from '../theme/defaultTheme.json';

const ThemeEditor = () => {
  const [theme, setTheme] = useState(defaultTheme);
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

  return null;
};

export default ThemeEditor;
