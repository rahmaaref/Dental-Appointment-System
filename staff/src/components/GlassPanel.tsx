import React from 'react';
import { cn } from '@/lib/utils';

interface GlassPanelProps {
  children: React.ReactNode;
  className?: string;
  neonBorder?: boolean;
  solid?: boolean;
}

const GlassPanel: React.FC<GlassPanelProps> = ({ 
  children, 
  className = '', 
  neonBorder = false,
  solid = false 
}) => {
  const baseClasses = solid ? 'glass-panel-solid' : 'glass-panel';
  const borderClasses = neonBorder ? 'neon-border' : '';
  
  return (
    <div className={cn(baseClasses, borderClasses, className)}>
      {children}
    </div>
  );
};

export default GlassPanel;