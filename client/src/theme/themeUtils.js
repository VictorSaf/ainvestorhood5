// Utilități pentru export/import tema Ant Design
// Pentru folosirea cu Theme Editor de la ant.design

/**
 * Exportă tema curentă într-un format compatibil cu Theme Editor
 * @param {Object} theme - Obiectul temă Ant Design
 * @returns {string} JSON string pentru export
 */
export const exportTheme = (theme) => {
  const exportableTheme = {
    algorithm: theme.algorithm || 'defaultAlgorithm',
    token: theme.token || {},
    components: theme.components || {}
  };
  
  return JSON.stringify(exportableTheme, null, 2);
};

/**
 * Descarcă tema ca fișier JSON
 * @param {Object} theme - Obiectul temă Ant Design
 * @param {string} filename - Numele fișierului (default: 'antd-theme.json')
 */
export const downloadTheme = (theme, filename = 'antd-theme.json') => {
  const themeJson = exportTheme(theme);
  const blob = new Blob([themeJson], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
};

/**
 * Importă tema dintr-un fișier JSON
 * @param {File} file - Fișierul JSON cu tema
 * @returns {Promise<Object>} Promise cu obiectul temă
 */
export const importTheme = (file) => {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    
    reader.onload = (e) => {
      try {
        const theme = JSON.parse(e.target.result);
        resolve(theme);
      } catch (error) {
        reject(new Error('Fișierul JSON nu este valid'));
      }
    };
    
    reader.onerror = () => {
      reject(new Error('Eroare la citirea fișierului'));
    };
    
    reader.readAsText(file);
  });
};

/**
 * Validează structura temei
 * @param {Object} theme - Obiectul temă
 * @returns {boolean} True dacă tema este validă
 */
export const validateTheme = (theme) => {
  if (!theme || typeof theme !== 'object') return false;
  
  // Verifică structura de bază
  const hasValidStructure = 
    theme.hasOwnProperty('token') || 
    theme.hasOwnProperty('components') || 
    theme.hasOwnProperty('algorithm');
    
  return hasValidStructure;
};

/**
 * Combină două teme (merge)
 * @param {Object} baseTheme - Tema de bază
 * @param {Object} overrideTheme - Tema care suprascrie
 * @returns {Object} Tema combinată
 */
export const mergeThemes = (baseTheme, overrideTheme) => {
  return {
    algorithm: overrideTheme.algorithm || baseTheme.algorithm,
    token: {
      ...baseTheme.token,
      ...overrideTheme.token
    },
    components: {
      ...baseTheme.components,
      ...overrideTheme.components
    }
  };
};

/**
 * Convertește tema pentru folosirea cu theme.algorithm
 * @param {Object} theme - Tema cu algorithm ca string
 * @returns {Object} Tema cu algorithm ca funcție
 */
export const processThemeAlgorithm = (theme, themeModule) => {
  const processedTheme = { ...theme };
  
  if (typeof theme.algorithm === 'string') {
    switch (theme.algorithm) {
      case 'darkAlgorithm':
        processedTheme.algorithm = themeModule.darkAlgorithm;
        break;
      case 'compactAlgorithm':
        processedTheme.algorithm = themeModule.compactAlgorithm;
        break;
      default:
        processedTheme.algorithm = themeModule.defaultAlgorithm;
    }
  }
  
  return processedTheme;
};