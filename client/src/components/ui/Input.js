import React from 'react';

const Input = ({ 
  type = 'text',
  placeholder,
  value,
  onChange,
  disabled = false,
  error = false,
  className = '',
  size = 'md',
  prefix,
  suffix,
  ...props 
}) => {
  const baseClasses = 'w-full border rounded-lg transition-colors duration-200 focus:outline-none focus:ring-2 focus:ring-primary-500 focus:border-transparent';
  const errorClasses = error ? 'border-danger-500 focus:ring-danger-500' : 'border-gray-300 hover:border-gray-400';
  const disabledClasses = disabled ? 'bg-gray-100 cursor-not-allowed' : 'bg-white';
  
  const sizes = {
    sm: 'px-3 py-1.5 text-sm',
    md: 'px-3 py-2 text-sm',
    lg: 'px-4 py-3 text-base'
  };
  
  const classes = `${baseClasses} ${errorClasses} ${disabledClasses} ${sizes[size]} ${className}`;
  
  if (prefix || suffix) {
    return (
      <div className="relative">
        {prefix && (
          <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
            {prefix}
          </div>
        )}
        <input
          type={type}
          placeholder={placeholder}
          value={value}
          onChange={onChange}
          disabled={disabled}
          className={`${classes} ${prefix ? 'pl-10' : ''} ${suffix ? 'pr-10' : ''}`}
          {...props}
        />
        {suffix && (
          <div className="absolute inset-y-0 right-0 pr-3 flex items-center">
            {suffix}
          </div>
        )}
      </div>
    );
  }
  
  return (
    <input
      type={type}
      placeholder={placeholder}
      value={value}
      onChange={onChange}
      disabled={disabled}
      className={classes}
      {...props}
    />
  );
};

export default Input;