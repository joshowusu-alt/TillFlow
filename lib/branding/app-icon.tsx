import React from 'react';

type IconVariant = 'default' | 'apple';

/**
 * TillFlow app icon, sourced from the uploaded official app-logo artwork.
 */
export function renderTillFlowAppIcon(size: number, _variant: IconVariant = 'default') {
  return (
    <img
      src="/brand/tillflow-app-icon.png"
      alt="TillFlow"
      width={size}
      height={size}
      style={{
        display: 'block',
        width: size,
        height: size,
        objectFit: 'cover',
      }}
    />
  );
}
