import { relative } from 'node:path';

/**
 * Scan rules shared by the reporting-clock invariant test.
 *
 * These helpers hold the source-scanning semantics used by
 * `lib/reports/wave-a7-reporting-clock-invariant.test.ts` so that the rules
 * themselves can be unit-tested for cross-platform behaviour (Windows path
 * separators versus POSIX) independently of the repository walk.
 */

/** Canonical tenant-window constructors whose call sites must carry a stored timezone. */
export const TENANT_WINDOW_CONSTRUCTORS =
  /resolveReportDateRange\(|resolveExportDateRange\(|businessDayWindow\(|businessWeekWindow\(|businessMonthWindow\(|localDateInstant\(|defaultTenantLocalRange\(/;

/** Label used to report a scanned file relative to the scan root. */
export function scanLabel(root: string, file: string): string {
  return relative(root, file);
}

/** Normalise a scan label so that the same file yields the same label on every platform. */
export function normaliseScanLabel(label: string): string {
  return label;
}

/** True when a scan label points at a Next.js `app/` route or page. */
export function isAppRouteLabel(label: string): boolean {
  return label.startsWith('app/');
}

/** True when a route source loads the tenant's stored timezone for its window constructors. */
export function routeLoadsTenantZone(source: string): boolean {
  return /business\.timezone|requireReportTimeZone\(|timeZone/.test(source);
}

export interface AppRouteScanReport {
  /** App-route labels that call a canonical constructor and were therefore checked. */
  examined: string[];
  /** Subset of `examined` whose source does not load the tenant timezone. */
  missing: string[];
}

/** Scan app routes that build tenant windows and report which ones were examined and which lack a stored timezone. */
export function appRouteScanReport(
  files: readonly string[],
  root: string,
  read: (file: string) => string,
): AppRouteScanReport {
  const examined: string[] = [];
  const missing: string[] = [];
  for (const file of files) {
    const label = scanLabel(root, file);
    if (!isAppRouteLabel(label)) continue;
    const source = read(file);
    if (!TENANT_WINDOW_CONSTRUCTORS.test(source)) continue;
    examined.push(label);
    if (!routeLoadsTenantZone(source)) missing.push(label);
  }
  return { examined, missing };
}

/** App-route labels that build a tenant window without loading `Business.timezone`. */
export function appRoutesMissingTenantZone(
  files: readonly string[],
  root: string,
  read: (file: string) => string,
): string[] {
  return appRouteScanReport(files, root, read).missing;
}
