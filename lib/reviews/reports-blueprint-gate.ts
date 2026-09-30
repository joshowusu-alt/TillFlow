/**
 * Review-only gate for the reports redesign prototype.
 * Production always refuses. Preview and local development may render it.
 * The page uses synthetic data and is not linked from customer navigation.
 */
export const REPORTS_BLUEPRINT_PATH = '/reviews/reports-redesign-blueprint';

export function isReportsBlueprintPath(pathname: string): boolean {
  return pathname === REPORTS_BLUEPRINT_PATH;
}

export function isReportsBlueprintAllowed(env: {
  vercelEnv?: string;
  nodeEnv?: string;
  allowFlag?: string;
} = {
  vercelEnv: process.env.VERCEL_ENV,
  nodeEnv: process.env.NODE_ENV,
  allowFlag: process.env.ALLOW_REPORTS_BLUEPRINT,
}): boolean {
  if (env.vercelEnv === 'production') return false;
  if (env.vercelEnv === 'preview') return true;
  if (env.nodeEnv === 'development') return true;
  return env.allowFlag === 'true';
}
