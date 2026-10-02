import type { ReactNode } from 'react';

/**
 * Shared Reports canvas. One shell gutter comes from the app main.
 * This ceiling is 1440px. Below that the canvas fills the shell.
 */
export const REPORTS_CANVAS_MAX_PX = 1440;

export function ReportsCanvas({ children }: { children: ReactNode }) {
  return (
    <div
      className="mx-auto w-full min-w-0 max-w-[1440px]"
      data-reports-canvas=""
      data-canvas-max={REPORTS_CANVAS_MAX_PX}
    >
      {children}
    </div>
  );
}
