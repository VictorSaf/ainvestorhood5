import React from 'react';

// Professional SVG icons for financial instruments
export const StockIcon = ({ size = 24, color = "#2563eb" }) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
    <path 
      d="M3 3V21H21V19H5V3H3Z" 
      fill={color}
    />
    <path 
      d="M7 14L9.5 11.5L13.5 15.5L20 9L18.59 7.59L13.5 12.67L9.5 8.67L7 11.17V14Z" 
      fill={color}
    />
  </svg>
);

export const ForexIcon = ({ size = 24, color = "#059669" }) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
    <path 
      d="M12 2C6.48 2 2 6.48 2 12S6.48 22 12 22 22 17.52 22 12 17.52 2 12 2ZM13.64 7L15.07 9.43C14.5 9.77 13.93 10.07 13.36 10.33C13.69 9.73 14.14 9.2 14.69 8.75L13.64 7ZM12 4.03C14.81 4.56 17.09 6.84 17.62 9.65L16.17 8.2C15.38 7.41 14.46 6.8 13.45 6.39L12 4.03ZM7.08 7.08C7.63 6.53 8.29 6.1 9 5.81L10.45 8.17C9.44 8.58 8.52 9.19 7.73 9.98L6.28 8.53C6.5 8.03 6.77 7.54 7.08 7.08ZM4.03 12C4.56 9.19 6.84 6.91 9.65 6.38L8.2 7.83C7.41 8.62 6.8 9.54 6.39 10.55L4.03 12ZM9.57 15.07L7 13.64C7.41 13.07 7.77 12.5 8.03 11.93C8.6 12.26 9.13 12.71 9.57 15.07ZM12 19.97C9.19 19.44 6.91 17.16 6.38 14.35L7.83 15.8C8.62 16.59 9.54 17.2 10.55 17.61L12 19.97ZM16.92 16.92C16.37 17.47 15.71 17.9 15 18.19L13.55 15.83C14.56 15.42 15.48 14.81 16.27 14.02L17.72 15.47C17.5 15.97 17.23 16.46 16.92 16.92ZM19.97 12C19.44 14.81 17.16 17.09 14.35 17.62L15.8 16.17C16.59 15.38 17.2 14.46 17.61 13.45L19.97 12Z" 
      fill={color}
    />
  </svg>
);

export const CryptoIcon = ({ size = 24, color = "#f59e0b" }) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
    <path 
      d="M12 2L13.09 8.26L22 9L13.09 9.74L12 16L10.91 9.74L2 9L10.91 8.26L12 2Z" 
      fill={color}
    />
    <path 
      d="M12 6.5C8.96 6.5 6.5 8.96 6.5 12S8.96 17.5 12 17.5 17.5 15.04 17.5 12 15.04 6.5 12 6.5ZM12 15.5C10.07 15.5 8.5 13.93 8.5 12S10.07 8.5 12 8.5 15.5 10.07 15.5 12 13.93 15.5 12 15.5Z" 
      fill={color}
    />
    <path 
      d="M12 10V14M10 12H14" 
      stroke={color} 
      strokeWidth="1.5" 
      strokeLinecap="round"
    />
  </svg>
);

export const CommodityIcon = ({ size = 24, color = "#dc2626" }) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
    <path 
      d="M12 2C13.1 2 14 2.9 14 4C14 5.1 13.1 6 12 6C10.9 6 10 5.1 10 4C10 2.9 10.9 2 12 2ZM21 9V7L15 1H9V3H7V5H9V7L3 9V11H5L6.5 14.5L5.5 16.5C5.09 17.31 5.21 18.28 5.81 18.97C6.5 19.75 7.62 19.94 8.5 19.5L12 17.5L15.5 19.5C16.38 19.94 17.5 19.75 18.19 18.97C18.79 18.28 18.91 17.31 18.5 16.5L17.5 14.5L19 11H21V9ZM9.5 12.5C9.5 11.67 10.17 11 11 11S12.5 11.67 12.5 12.5 11.83 14 11 14 9.5 13.33 9.5 12.5ZM14.5 12.5C14.5 11.67 15.17 11 16 11S17.5 11.67 17.5 12.5 16.83 14 16 14 14.5 13.33 14.5 12.5Z" 
      fill={color}
    />
  </svg>
);

export const IndexIcon = ({ size = 24, color = "#7c3aed" }) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
    <path 
      d="M3 3V21H21V19H5V3H3Z" 
      fill={color}
    />
    <path 
      d="M6 17H8V10H6V17ZM9.5 17H11.5V7H9.5V17ZM13 17H15V13H13V17ZM16.5 17H18.5V4H16.5V17Z" 
      fill={color}
    />
  </svg>
);

export const GeneralIcon = ({ size = 24, color = "#6b7280" }) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
    <path 
      d="M12 2L15.09 8.26L22 9L17 14L18.18 21L12 17.77L5.82 21L7 14L2 9L8.91 8.26L12 2Z" 
      fill={color}
    />
  </svg>
);

// Icon selector component
export const FinancialIcon = ({ instrumentType, size = 24 }) => {
  const getIconProps = (type) => {
    switch (type?.toLowerCase()) {
      case 'stocks':
      case 'stock':
        return { Icon: StockIcon, color: "#2563eb" };
      case 'forex':
      case 'currency':
        return { Icon: ForexIcon, color: "#059669" };
      case 'crypto':
      case 'cryptocurrency':
      case 'bitcoin':
      case 'ethereum':
        return { Icon: CryptoIcon, color: "#f59e0b" };
      case 'commodities':
      case 'commodity':
      case 'oil':
      case 'gold':
        return { Icon: CommodityIcon, color: "#dc2626" };
      case 'indices':
      case 'index':
      case 'etf':
        return { Icon: IndexIcon, color: "#7c3aed" };
      default:
        return { Icon: GeneralIcon, color: "#6b7280" };
    }
  };

  const { Icon, color } = getIconProps(instrumentType);
  
  return (
    <div className="financial-icon">
      <Icon size={size} color={color} />
    </div>
  );
};