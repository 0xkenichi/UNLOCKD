import React from 'react';

interface CardProps {
  children: React.ReactNode;
  className?: string;
  variant?: 'default' | 'glass' | 'solid';
  hoverable?: boolean;
}

export const Card: React.FC<CardProps> = ({ 
  children, 
  className = '', 
  variant = 'glass',
  hoverable = true 
}) => {
  const baseStyles = 'rounded-xl overflow-hidden transition-all duration-300';
  
  const variants = {
    default: 'bg-surface border border-border-glass',
    glass: 'glass-card',
    solid: 'bg-surface shadow-2xl'
  };
  
  const hoverStyles = hoverable ? 'hover:glass-card-hover hover:-translate-y-1' : '';
  
  return (
    <div className={`${baseStyles} ${variants[variant]} ${hoverStyles} ${className}`}>
      {children}
    </div>
  );
};

export const CardHeader: React.FC<{ children: React.ReactNode; className?: string }> = ({ 
  children, 
  className = '' 
}) => (
  <div className={`p-6 border-b border-border-glass ${className}`}>
    {children}
  </div>
);

export const CardTitle: React.FC<{ children: React.ReactNode; className?: string }> = ({ 
  children, 
  className = '' 
}) => (
  <h3 className={`text-xl font-display font-bold ${className}`}>
    {children}
  </h3>
);

export const CardContent: React.FC<{ children: React.ReactNode; className?: string }> = ({ 
  children, 
  className = '' 
}) => (
  <div className={`p-6 ${className}`}>
    {children}
  </div>
);

export const CardFooter: React.FC<{ children: React.ReactNode; className?: string }> = ({ 
  children, 
  className = '' 
}) => (
  <div className={`p-6 border-t border-border-glass bg-surface/30 ${className}`}>
    {children}
  </div>
);
