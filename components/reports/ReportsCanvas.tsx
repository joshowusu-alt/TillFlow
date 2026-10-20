import type { ReactNode } from 'react';

/**
 * Shared Reports canvas. One shell gutter comes from the app main.
 * Fill the available screen, using the same app gutter as Stock and Sell.
 */
export function ReportsCanvas({ children }: { children: ReactNode }) {
  return (
    <div
      className="w-full min-w-0 max-w-full"
      data-reports-canvas=""
    >
      {children}
    </div>
  );
}
