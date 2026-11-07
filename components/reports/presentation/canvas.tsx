import type { ReactNode } from 'react';

/**
 * Shared Reports canvas for the Stage 3A.1 blueprint.
 * Not mounted on customer routes.
 *
 * Maximum content width is 1440px. Below that, the canvas fills the shell
 * after one gutter. At 1920px the extra space stays outside the canvas so
 * prose and tables are not stretched across the viewport, while 1280px and
 * 1440px still get a full grid rather than a 1152px column.
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
