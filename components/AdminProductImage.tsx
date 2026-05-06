'use client';

import { useState } from 'react';

interface AdminProductImageProps {
  src: string;
  alt: string;
  fallbackChar: string;
  className: string;
  fallbackClassName: string;
  fallbackStyle?: React.CSSProperties;
}

export function AdminProductImage({
  src,
  alt,
  fallbackChar,
  className,
  fallbackClassName,
  fallbackStyle,
}: AdminProductImageProps) {
  const [failed, setFailed] = useState(false);

  if (failed) {
    return (
      <div className={fallbackClassName} style={fallbackStyle}>
        {fallbackChar}
      </div>
    );
  }

  return (
    <img
      src={src}
      alt={alt}
      className={className}
      onError={() => setFailed(true)}
    />
  );
}
