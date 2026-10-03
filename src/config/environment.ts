export interface Environment {
  DATABASE_URL: string;
  PORT: number;
  DB_POOL_MAX: number;
  CORS_ORIGINS: string;
  NODE_ENV: string;
  DB_SSL_CA?: string;
}

function integer(value: unknown, fallback: number, max: number, name: string): number {
  const parsed = value === undefined || value === '' ? fallback : Number(value);
  if (!Number.isInteger(parsed) || parsed < 1 || parsed > max) {
    throw new Error(`${name} must be an integer between 1 and ${max}`);
  }
  return parsed;
}

export function validateEnvironment(input: Record<string, unknown>): Environment {
  let url: URL;
  try {
    url = new URL(String(input.DATABASE_URL ?? ''));
  } catch {
    throw new Error('DATABASE_URL must be a PostgreSQL URI with sslmode=require');
  }
  if (!['postgres:', 'postgresql:'].includes(url.protocol) || !url.hostname || url.pathname.length < 2) {
    throw new Error('DATABASE_URL must specify a PostgreSQL host and database');
  }
  const sslmode = url.searchParams.get('sslmode');
  if (!sslmode || !['require', 'verify-ca', 'verify-full'].includes(sslmode)) {
    throw new Error('DATABASE_URL must require TLS (sslmode=require or verify-full)');
  }
  // Only sslmode is accepted in the URI: pg would otherwise override our verified TLS config.
  if ([...url.searchParams.keys()].some((key) => key !== 'sslmode')) {
    throw new Error('DATABASE_URL supports only sslmode in its query; use DB_SSL_CA for the CA');
  }
  const nodeEnv = String(input.NODE_ENV ?? 'development');
  if (!['development', 'test', 'production'].includes(nodeEnv)) {
    throw new Error('NODE_ENV must be development, test or production');
  }
  const origins = String(input.CORS_ORIGINS ?? '').trim();
  for (const origin of origins.split(',').map((item) => item.trim()).filter(Boolean)) {
    try {
      const parsed = new URL(origin);
      if (!['http:', 'https:', 'capacitor:', 'ionic:'].includes(parsed.protocol)
        || !parsed.hostname || parsed.username || parsed.password
        || parsed.search || parsed.hash || !['', '/'].includes(parsed.pathname)
        || origin.endsWith('/')) {
        throw new Error();
      }
    } catch {
      throw new Error('CORS_ORIGINS must contain comma-separated exact origins without trailing slashes');
    }
  }
  return {
    DATABASE_URL: url.toString(),
    PORT: integer(input.PORT, 3000, 65535, 'PORT'),
    DB_POOL_MAX: integer(input.DB_POOL_MAX, 2, 100, 'DB_POOL_MAX'),
    CORS_ORIGINS: origins,
    NODE_ENV: nodeEnv,
    DB_SSL_CA: typeof input.DB_SSL_CA === 'string' && input.DB_SSL_CA
      ? input.DB_SSL_CA.replace(/\\n/g, '\n') : undefined,
  };
}
