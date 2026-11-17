/**
 * Review-only gate for the Stage 3A experience surface.
 * Production always refuses. Preview and local development may render it.
 * The page uses synthetic data and is not linked from customer navigation.
 */
export const REPORTS_STAGE3A_REVIEW_PATH = '/reviews/reports-stage3a';
export const REPORTS_MONEY_LAYOUT_REVIEW_PATH = '/reviews/reports-money-layout';
export const REPORTS_STAGE3A_CONTEXT_REVIEW_PATH = '/reviews/reports-stage3a-context';
export const REPORTS_TODAY_LAYOUT_REVIEW_PATH = '/reviews/reports-today-layout';
export const REPORTS_STAGE3A1_REVIEW_PATH = '/reviews/reports-stage3a1';
export const REPORTS_STAGE3A1_DESTINATION_REVIEW_PATH = '/reviews/reports-stage3a1-destination';

export function isReportsStage3aPath(pathname: string): boolean {
  return pathname === REPORTS_STAGE3A_REVIEW_PATH
    || pathname === REPORTS_MONEY_LAYOUT_REVIEW_PATH
    || pathname === REPORTS_STAGE3A_CONTEXT_REVIEW_PATH
    || pathname === REPORTS_TODAY_LAYOUT_REVIEW_PATH
    || pathname === REPORTS_STAGE3A1_REVIEW_PATH
    || pathname === REPORTS_STAGE3A1_DESTINATION_REVIEW_PATH;
}

export function isReportsStage3aAllowed(env: {
  vercelEnv?: string;
  nodeEnv?: string;
} = {
  vercelEnv: process.env.VERCEL_ENV,
  nodeEnv: process.env.NODE_ENV,
}): boolean {
  if (env.vercelEnv === 'production') return false;
  if (env.vercelEnv === 'preview') return true;
  if (env.nodeEnv === 'development') return true;
  return false;
}
