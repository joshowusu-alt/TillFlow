/**
 * Runs once in the vitest main process before any worker, setup file, test, migration,
 * seed or fixture. Resolves and guards the database target, pins every Prisma URL
 * variable to it (forked workers inherit process.env), and prints the sanitised identity.
 * A refused target throws here and aborts the whole run — nothing downstream executes.
 */
import { formatVitestGuardLine, prepareVitestDatabaseEnv } from './lib/test/vitest-database-env';

export default function globalSetup() {
  const result = prepareVitestDatabaseEnv(process.env);
  // eslint-disable-next-line no-console
  console.info(formatVitestGuardLine(result));
}
