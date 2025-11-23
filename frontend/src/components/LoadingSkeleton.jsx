import React from 'react';

function LoadingSkeleton({ count = 3, height = '80px' }) {
  return (
    <>
      {[...Array(count)].map((_, i) => (
        <div
          key={i}
          style={{
            height,
            background: 'linear-gradient(90deg, #1a1a2e 25%, #2a2a3e 50%, #1a1a2e 75%)',
            backgroundSize: '200% 100%',
            animation: 'shimmer 1.5s infinite',
            borderRadius: '8px',
            marginBottom: '0.75rem'
          }}
        />
      ))}
    </>
  );
}

export default LoadingSkeleton;
