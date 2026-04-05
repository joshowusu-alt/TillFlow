const SQLITE_FILE_PATTERN = /(^|[\\/])[^?#]+\.(db|sqlite|sqlite3)(?:$|[?#])/i;

export function isSqliteDatabaseUrl(databaseUrl?: string | null) {
  const normalized = databaseUrl?.trim() ?? '';
  if (!normalized) return false;

  const lower = normalized.toLowerCase();
  if (lower.startsWith('file:') || lower.startsWith('sqlite:')) {
    return true;
  }

  if (/^[a-z]+:\/\//i.test(normalized)) {
    return false;
  }

  return SQLITE_FILE_PATTERN.test(normalized);
}

export function isPostgresDatabaseUrl(databaseUrl?: string | null) {
  const normalized = databaseUrl?.trim().toLowerCase() ?? '';
  return normalized.startsWith('postgres://') || normalized.startsWith('postgresql://');
}

function getPostgresRuntimeUrls(env: NodeJS.ProcessEnv) {
  return [
    env.POSTGRES_PRISMA_URL,
    env.POSTGRES_URL_NON_POOLING,
    env.POSTGRES_URL,
    env.DATABASE_URL,
  ];
}

export function isPostgresRuntimeEnv(env: NodeJS.ProcessEnv = process.env) {
  return getPostgresRuntimeUrls(env).some((databaseUrl) => isPostgresDatabaseUrl(databaseUrl));
}

export function isSqliteRuntimeEnv(env: NodeJS.ProcessEnv = process.env) {
  if (isPostgresRuntimeEnv(env)) {
    return false;
  }

  return isSqliteDatabaseUrl(env.DATABASE_URL);
}
