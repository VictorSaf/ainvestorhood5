import React from 'react';

const Layout = ({ children, className = '', ...props }) => {
  return (
    <div className={`min-h-screen bg-gray-50 ${className}`} {...props}>
      {children}
    </div>
  );
};

const Header = ({ children, className = '', fixed = false, ...props }) => {
  const baseClasses = 'bg-white border-b border-gray-200 z-40';
  const fixedClasses = fixed ? 'fixed top-0 left-0 right-0' : '';
  
  return (
    <header className={`${baseClasses} ${fixedClasses} ${className}`} {...props}>
      {children}
    </header>
  );
};

const Content = ({ children, className = '', padded = true, ...props }) => {
  const paddingClasses = padded ? 'p-4 md:p-6' : '';
  
  return (
    <main className={`flex-1 ${paddingClasses} ${className}`} {...props}>
      {children}
    </main>
  );
};

const Container = ({ children, className = '', maxWidth = 'max-w-7xl', ...props }) => {
  return (
    <div className={`mx-auto px-4 sm:px-6 lg:px-8 ${maxWidth} ${className}`} {...props}>
      {children}
    </div>
  );
};

Layout.Header = Header;
Layout.Content = Content;
Layout.Container = Container;

export default Layout;