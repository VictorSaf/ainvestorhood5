// AntV Theme Configuration
export const antvTheme = {
  categorical: [
    "#FFD081", "#BE6FFF", "#FF5ABA", "#2AB9E9", "#8196FF",
    "#FF8F57", "#32CC25", "#7F78FF", "#A3C31D", "#48D097",
    "#0F8EB6", "#F98460", "#E24CF0", "#FF7DB3", "#12A983",
    "#FF7AFF", "#96D021", "#7798DB", "#D4C73E", "#D0A748"
  ],
  
  primary: {
    main: "#2AB9E9",
    light: "#78f2ff",
    dark: "#0F8EB6"
  },
  
  secondary: {
    main: "#8196FF",
    light: "#b7c9ff",
    dark: "#667ee4"
  },
  
  success: {
    main: "#32CC25",
    light: "#56e744",
    dark: "#00b100"
  },
  
  warning: {
    main: "#FFD081",
    light: "#ffd081",
    dark: "#c59b4e"
  },
  
  error: {
    main: "#FF5ABA",
    light: "#ff8fed",
    dark: "#e33da2"
  },
  
  gradients: {
    primary: "linear-gradient(135deg, #2AB9E9 0%, #8196FF 100%)",
    success: "linear-gradient(135deg, #32CC25 0%, #48D097 100%)",
    warning: "linear-gradient(135deg, #FFD081 0%, #FF8F57 100%)",
    error: "linear-gradient(135deg, #FF5ABA 0%, #BE6FFF 100%)",
    neutral: "linear-gradient(135deg, #ffffff 0%, #f8faff 100%)",
    background: "linear-gradient(135deg, #f0f7ff 0%, #e6f4ff 50%, #f0f7ff 100%)"
  },
  
  shadows: {
    light: "0 2px 8px rgba(42, 185, 233, 0.08)",
    medium: "0 4px 16px rgba(42, 185, 233, 0.12)",
    heavy: "0 8px 32px rgba(42, 185, 233, 0.16)",
    colored: "0 4px 20px rgba(129, 150, 255, 0.15)"
  }
};

// Ant Design theme configuration using AntV colors
export const antdAntvTheme = {
  algorithm: undefined, // Let Ant Design use the default algorithm
  token: {
    colorPrimary: '#2AB9E9',
    colorSuccess: '#32CC25',
    colorWarning: '#FFD081',
    colorError: '#FF5ABA',
    colorInfo: '#8196FF',
    colorTextBase: '#1a1a1a',
    colorBgBase: '#ffffff',
    borderRadius: 12,
    wireframe: false,
    fontSize: 14,
    fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, "Helvetica Neue", Arial, sans-serif',
  },
  components: {
    Layout: {
      bodyBg: '#f0f7ff',
      headerBg: '#ffffff',
      siderBg: '#ffffff',
    },
    Card: {
      borderRadius: 16,
      boxShadow: '0 4px 20px rgba(0, 0, 0, 0.08)',
      headerBg: 'linear-gradient(135deg, rgba(255,255,255,0.95) 0%, rgba(248,250,255,0.95) 100%)',
    },
    Button: {
      borderRadius: 12,
      primaryShadow: '0 2px 8px rgba(42, 185, 233, 0.25)',
    },
    Input: {
      borderRadius: 10,
    },
    Select: {
      borderRadius: 10,
    },
    Modal: {
      borderRadius: 16,
      boxShadow: '0 12px 48px rgba(0, 0, 0, 0.12)',
    },
    Table: {
      borderRadius: 12,
      headerBg: '#f8faff',
    },
    Tag: {
      borderRadius: 20,
    },
    Progress: {
      defaultColor: '#2AB9E9',
    },
    Badge: {
      colorPrimary: '#2AB9E9',
    },
    Avatar: {
      colorPrimary: '#2AB9E9',
    }
  }
};

// Recommendation colors using AntV palette
export const recommendationColors = {
  BUY: {
    main: '#32CC25',
    light: '#56e744',
    gradient: 'linear-gradient(135deg, #32CC25 0%, #48D097 100%)',
    shadow: '0 4px 12px rgba(50, 204, 37, 0.3)'
  },
  SELL: {
    main: '#FF5ABA',
    light: '#ff8fed',
    gradient: 'linear-gradient(135deg, #FF5ABA 0%, #BE6FFF 100%)',
    shadow: '0 4px 12px rgba(255, 90, 186, 0.3)'
  },
  HOLD: {
    main: '#FFD081',
    light: '#ffd081',
    gradient: 'linear-gradient(135deg, #FFD081 0%, #FF8F57 100%)',
    shadow: '0 4px 12px rgba(255, 208, 129, 0.3)'
  }
};

// Confidence level colors
export const confidenceColors = {
  high: '#32CC25',
  medium: '#FFD081', 
  low: '#FF5ABA'
};

// Instrument type colors
export const instrumentColors = {
  stock: '#2AB9E9',
  crypto: '#BE6FFF', 
  forex: '#8196FF',
  commodity: '#FF8F57',
  general: '#7F78FF'
};