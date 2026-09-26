import { relative } from 'node:path';

/**
 * Scan rules shared by the reporting-clock invariant test.
 *
 * These helpers hold the source-scanning semantics used by
 * `lib/reports/wave-a7-reporting-clock-invariant.test.ts` so that the rules
 * themselves can be unit-tested for cross-platform behaviour (Windows path
 * separators versus POSIX) independently of the repository walk.
 */

/** Canonical tenant-window constructor names whose call sites must carry a stored timezone. */
const TENANT_WINDOW_CONSTRUCTOR_NAMES = [
  'resolveReportDateRange',
  'resolveExportDateRange',
  'businessDayWindow',
  'businessWeekWindow',
  'businessMonthWindow',
  'localDateInstant',
  'defaultTenantLocalRange',
] as const;

/** Canonical tenant-window constructors whose call sites must carry a stored timezone. */
export const TENANT_WINDOW_CONSTRUCTORS = new RegExp(
  TENANT_WINDOW_CONSTRUCTOR_NAMES.map((name) => `${name}\\(`).join('|'),
);

/** Normalise a scan label so that the same file yields the same label on every platform. */
export function normaliseScanLabel(label: string): string {
  return label.replace(/\\/g, '/');
}

/** Label used to report a scanned file relative to the scan root. */
export function scanLabel(root: string, file: string): string {
  return normaliseScanLabel(relative(root, file));
}

/** True when a scan label points at a Next.js `app/` route or page. */
export function isAppRouteLabel(label: string): boolean {
  return normaliseScanLabel(label).startsWith('app/');
}

const IDENTIFIER = /^[A-Za-z_$][\w$]*$/;
/** `IDENT.timezone` / `IDENT?.timezone` — a read of the stored `Business.timezone` column. */
const STORED_TIMEZONE_ACCESS = /\b[A-Za-z_$][\w$]*\??\.timezone\b/;
/** The canonical fail-closed accessor for the stored timezone. */
const REQUIRE_REPORT_TIME_ZONE = /\brequireReportTimeZone\s*\(/;
/** A `const|let|var NAME [: type] =` declaration head (excludes `==`). */
const DECLARATION_HEAD = /\b(?:const|let|var)\s+([A-Za-z_$][\w$]*)\s*(?::\s*[^=;]+?)?\s*=(?![=>])/g;
/** A `const|let|var { ...timezone... } = IDENT` destructuring of a business record. */
const TIMEZONE_DESTRUCTURE = /\b(?:const|let|var)\s*\{([^}]*)\}\s*=\s*([A-Za-z_$][\w$]*)/g;

/**
 * Replace line and block comments with whitespace, preserving newlines and
 * character offsets. String and template literals are skipped so that a `//`
 * inside quotes is never treated as a comment.
 */
export function stripComments(source: string): string {
  const out: string[] = [];
  let i = 0;
  const n = source.length;
  while (i < n) {
    const ch = source[i];
    const next = source[i + 1];
    if (ch === '/' && next === '*') {
      const end = source.indexOf('*/', i + 2);
      const stop = end === -1 ? n : end + 2;
      for (let j = i; j < stop; j += 1) out.push(source[j] === '\n' ? '\n' : ' ');
      i = stop;
      continue;
    }
    if (ch === '/' && next === '/') {
      let stop = i;
      while (stop < n && source[stop] !== '\n') stop += 1;
      for (let j = i; j < stop; j += 1) out.push(' ');
      i = stop;
      continue;
    }
    if (ch === "'" || ch === '"' || ch === '`') {
      const quote = ch;
      out.push(ch);
      i += 1;
      while (i < n) {
        const c = source[i];
        out.push(c);
        i += 1;
        if (c === '\\' && i < n) {
          out.push(source[i]);
          i += 1;
          continue;
        }
        if (c === quote) break;
        if (quote !== '`' && c === '\n') break;
      }
      continue;
    }
    out.push(ch);
    i += 1;
  }
  return out.join('');
}

/**
 * Starting at the index of an opening `(`, return the text between it and the
 * matching `)` (balanced across nested parentheses and string literals), or
 * `null` when the parenthesis is never closed.
 */
function balancedArguments(source: string, openIndex: number): string | null {
  let depth = 0;
  let i = openIndex;
  const n = source.length;
  while (i < n) {
    const ch = source[i];
    if (ch === "'" || ch === '"' || ch === '`') {
      const quote = ch;
      i += 1;
      while (i < n) {
        const c = source[i];
        i += 1;
        if (c === '\\') {
          i += 1;
          continue;
        }
        if (c === quote) break;
      }
      continue;
    }
    if (ch === '(') depth += 1;
    if (ch === ')') {
      depth -= 1;
      if (depth === 0) return source.slice(openIndex + 1, i);
    }
    i += 1;
  }
  return null;
}

/** Text of an initializer starting at `start`, ending at the first `;` at depth 0 or at a depth-0 newline. */
function initializerText(source: string, start: number): string {
  let depth = 0;
  let i = start;
  const n = source.length;
  while (i < n) {
    const ch = source[i];
    if (ch === "'" || ch === '"' || ch === '`') {
      const quote = ch;
      i += 1;
      while (i < n) {
        const c = source[i];
        i += 1;
        if (c === '\\') {
          i += 1;
          continue;
        }
        if (c === quote) break;
      }
      continue;
    }
    if (ch === '(' || ch === '[' || ch === '{') depth += 1;
    else if (ch === ')' || ch === ']' || ch === '}') {
      if (depth === 0) break;
      depth -= 1;
    } else if (depth === 0 && (ch === ';' || ch === '\n')) {
      break;
    }
    i += 1;
  }
  return source.slice(start, i);
}

/** Every argument text of every canonical constructor call in comment-free source (declarations are not calls). */
export function tenantWindowConstructorCalls(stripped: string): Array<{ name: string; args: string }> {
  const calls: Array<{ name: string; args: string }> = [];
  const pattern = new RegExp(`\\b(${TENANT_WINDOW_CONSTRUCTOR_NAMES.join('|')})\\s*\\(`, 'g');
  for (const match of stripped.matchAll(pattern)) {
    const index = match.index ?? 0;
    // `foo.businessDayWindow(` is a method on some other object, not the canonical constructor.
    if (index > 0 && stripped[index - 1] === '.') continue;
    // `function resolveExportDateRange(` declares a wrapper; its parameter list is not a call site.
    if (/\bfunction\s*\*?\s*$/.test(stripped.slice(Math.max(0, index - 32), index))) continue;
    const open = index + match[0].length - 1;
    const args = balancedArguments(stripped, open);
    if (args === null) continue;
    calls.push({ name: match[1], args });
  }
  return calls;
}

function wholeWordPattern(identifier: string): RegExp {
  const escaped = identifier.replace(/\$/g, '\\$');
  return new RegExp(`(?<![\\w$.])${escaped}(?![\\w$])`);
}

/** True when `text` directly reads the stored timezone or calls the fail-closed accessor. */
function directlyCarriesZone(text: string): boolean {
  return STORED_TIMEZONE_ACCESS.test(text) || REQUIRE_REPORT_TIME_ZONE.test(text);
}

/** True when `text` mentions a zone-carrying expression or a bound zone-carrying identifier as a whole word. */
function carriesZone(text: string, bound: ReadonlySet<string>): boolean {
  if (directlyCarriesZone(text)) return true;
  for (const name of bound) {
    if (wholeWordPattern(name).test(text)) return true;
  }
  return false;
}

/**
 * Identifiers whose declared initializer carries the stored timezone, either
 * directly (`business?.timezone`, `requireReportTimeZone(...)`), via a canonical
 * window constructor (whose result exposes `.timeZone`), or via another bound
 * identifier. Iterated to a fixpoint so chains of bindings resolve.
 */
export function zoneCarryingIdentifiers(stripped: string): Set<string> {
  const bound = new Set<string>();
  const declarations: Array<{ name: string; init: string }> = [];
  for (const match of stripped.matchAll(DECLARATION_HEAD)) {
    const name = match[1];
    if (!IDENTIFIER.test(name)) continue;
    const start = (match.index ?? 0) + match[0].length;
    declarations.push({ name, init: initializerText(stripped, start) });
  }
  const destructures: Array<{ names: string[]; from: string }> = [];
  for (const match of stripped.matchAll(TIMEZONE_DESTRUCTURE)) {
    const names: string[] = [];
    for (const part of match[1].split(',')) {
      const [key, alias] = part.split(':').map((s) => s.trim());
      if (!key) continue;
      const bare = key.replace(/^\.\.\./, '');
      if (bare === 'timezone' || bare === 'timeZone') names.push(alias || bare);
    }
    if (names.length) destructures.push({ names, from: match[2] });
  }

  let changed = true;
  while (changed) {
    changed = false;
    for (const { name, init } of declarations) {
      if (bound.has(name)) continue;
      if (TENANT_WINDOW_CONSTRUCTORS.test(init) || carriesZone(init, bound)) {
        bound.add(name);
        changed = true;
      }
    }
    for (const { names, from } of destructures) {
      for (const name of names) {
        if (bound.has(name)) continue;
        // `const { timezone } = business` reads the stored column; `const { timeZone } = scope` needs a bound source.
        if (name === 'timezone' || bound.has(from)) {
          bound.add(name);
          changed = true;
        }
      }
    }
  }
  return bound;
}

/**
 * True when every canonical tenant-window constructor call in the source is
 * handed the tenant's stored timezone: a direct `IDENT.timezone` read, the
 * fail-closed `requireReportTimeZone(...)`, or an identifier bound to one of
 * those (or to another canonical window, whose `.timeZone` field carries it).
 *
 * Comments are stripped first so a comment-only mention never counts, and a
 * string-literal initializer (`const timeZone = 'Africa/Accra'`) is never
 * zone-carrying. A source with no constructor call at all is vacuously true;
 * callers filter by `TENANT_WINDOW_CONSTRUCTORS` before asking.
 */
export function routeLoadsTenantZone(source: string): boolean {
  const stripped = stripComments(source);
  const calls = tenantWindowConstructorCalls(stripped);
  if (calls.length === 0) return true;
  const bound = zoneCarryingIdentifiers(stripped);
  return calls.every((call) => carriesZone(call.args, bound));
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
