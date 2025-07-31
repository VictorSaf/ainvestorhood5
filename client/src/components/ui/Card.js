import React from 'react';

const Card = ({ 
  children, 
  className = '', 
  hoverable = false,
  bordered = true,
  ...props 
}) => {
  const baseClasses = 'bg-white rounded-lg';
  const borderClasses = bordered ? 'border border-gray-200' : '';
  const hoverClasses = hoverable ? 'hover:shadow-lg transition-shadow duration-200 cursor-pointer' : '';
  const shadowClasses = 'shadow-sm';
  
  const classes = `${baseClasses} ${borderClasses} ${shadowClasses} ${hoverClasses} ${className}`;
  
  return (
    <div className={classes} {...props}>
      {children}
    </div>
  );
};

const CardHeader = ({ children, className = '', ...props }) => {
  return (
    <div className={`px-6 py-4 border-b border-gray-200 ${className}`} {...props}>
      {children}
    </div>
  );
};

const CardBody = ({ children, className = '', ...props }) => {
  return (
    <div className={`px-6 py-4 ${className}`} {...props}>
      {children}
    </div>
  );
};

const CardFooter = ({ children, className = '', ...props }) => {
  return (
    <div className={`px-6 py-4 border-t border-gray-200 ${className}`} {...props}>
      {children}
    </div>
  );
};

Card.Header = CardHeader;
Card.Body = CardBody;
Card.Footer = CardFooter;

export default Card;