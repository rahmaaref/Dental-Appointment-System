import React from 'react';

const LoadingSpinner: React.FC = () => {
  return (
    <div className="flex items-center justify-center p-8">
      <div className="relative">
        <div className="w-12 h-12 rounded-full border-4 border-primary/20 border-t-primary animate-spin" />
        <div className="absolute inset-0 w-12 h-12 rounded-full shadow-neon animate-glow-pulse" />
      </div>
    </div>
  );
};

export default LoadingSpinner;