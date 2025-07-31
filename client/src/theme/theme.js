// Fișier dedicat pentru tema Ant Design
// Editat cu Theme Editor de la ant.design

export const antdTheme = {
  algorithm: 'defaultAlgorithm', // sau 'darkAlgorithm' - va fi procesat automat
  token: {
    // CULORI PRINCIPALE - editabile în Theme Editor
    colorPrimary: '#1890ff',
    colorSuccess: '#52c41a', 
    colorWarning: '#faad14',
    colorError: '#f5222d',
    colorInfo: '#1890ff',
    
    // TYPOGRAPHY - editabile în Theme Editor
    fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, "Helvetica Neue", Arial, sans-serif',
    fontSize: 14,
    fontSizeHeading1: 38,
    fontSizeHeading2: 30,
    fontSizeHeading3: 24,
    
    // SPACING & BORDERS - editabile în Theme Editor
    borderRadius: 8,
    borderRadiusXS: 4,
    borderRadiusSM: 6, 
    borderRadiusLG: 12,
    
    // SHADOWS - editabile în Theme Editor
    boxShadow: '0 2px 8px rgba(0,0,0,0.06)',
    boxShadowSecondary: '0 4px 16px rgba(0,0,0,0.08)',
    
    // LAYOUT
    wireframe: false,
  },
  components: {
    // LAYOUT COMPONENTS
    Layout: {
      headerBg: 'rgba(255, 255, 255, 0.95)',
      bodyBg: 'linear-gradient(135deg, #f0f2f5 0%, #e6f7ff 50%, #f0f2f5 100%)',
      siderBg: '#ffffff',
      footerBg: 'rgba(255, 255, 255, 0.95)',
    },
    
    // CARDS
    Card: {
      borderRadius: 12,
      boxShadow: '0 4px 20px rgba(0,0,0,0.08)',
      paddingLG: 24,
    },
    
    // BUTTONS
    Button: {
      borderRadius: 8,
      boxShadow: '0 2px 4px rgba(0,0,0,0.05)',
    },
    
    // INPUTS
    Input: {
      borderRadius: 8,
    },
    Select: {
      borderRadius: 8,
    },
    
    // MODALS
    Modal: {
      borderRadius: 12,
      boxShadow: '0 8px 32px rgba(0,0,0,0.12)',
    },
    
    // TABLES
    Table: {
      borderRadius: 8,
    },
    
    // STATISTICS
    Statistic: {
      titleFontSize: 14,
      contentFontSize: 20,
    },
    
    // BADGES
    Badge: {
      fontSizeSM: 12,
    },
    
    // ALERTS
    Alert: {
      borderRadius: 8,
    },
    
    // PROGRESS
    Progress: {
      remainingColor: 'rgba(0,0,0,0.06)',
    }
  }
};

// Export pentru dark theme
export const antdDarkTheme = {
  ...antdTheme,
  algorithm: 'darkAlgorithm',
  token: {
    ...antdTheme.token,
    colorBgBase: '#141414',
    colorTextBase: '#fff',
  }
};