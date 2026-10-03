import { validateEnvironment } from '../src/config/environment';
import { corsOptions } from '../src/config/cors';
import { poolOptions } from '../src/database/pool';

const base = { DATABASE_URL: 'postgres://user:secret@db.example:1234/defaultdb?sslmode=require' };

function allowed(origin: string | undefined, nodeEnv = 'production'): boolean {
  const callback = jest.fn();
  const check = corsOptions('https://app.example,capacitor://localhost', nodeEnv).origin;
  if (typeof check !== 'function') throw new Error('Expected callback origin policy');
  check(origin, callback);
  return callback.mock.calls[0]?.[1] as boolean;
}

describe('environment, TLS and CORS', () => {
  it('uses one small bounded pool and verified TLS even for sslmode=require', () => {
    const config = validateEnvironment(base);
    expect(config.DB_POOL_MAX).toBe(2);
    expect(config.PORT).toBe(3000);
    const options = poolOptions(config);
    expect(options.max).toBe(2);
    expect(options.connectionString).not.toContain('sslmode');
    expect(options.ssl).toEqual({ rejectUnauthorized: true });
    expect(options.connectionTimeoutMillis).toBe(5000);
  });

  it('supports an Aiven CA without letting URI SSL flags override it', () => {
    expect(poolOptions(validateEnvironment({ ...base, DB_SSL_CA: 'first\\nsecond' })).ssl)
      .toEqual({ rejectUnauthorized: true, ca: 'first\nsecond' });
    expect(() => validateEnvironment({ DATABASE_URL: `${base.DATABASE_URL}&sslrootcert=secret` })).toThrow('only sslmode');
  });

  it.each([
    {}, { DATABASE_URL: 'invalid-secret' }, { DATABASE_URL: 'postgres://u:p@h/db?sslmode=disable' },
    { ...base, DB_POOL_MAX: '0' }, { ...base, PORT: 'not-an-integer' },
    { ...base, CORS_ORIGINS: '*' }, { ...base, CORS_ORIGINS: 'https://app.example/path' },
  ])('rejects invalid configuration without echoing its values', (input) => {
    expect(() => validateEnvironment(input)).toThrow();
    try { validateEnvironment(input); } catch (error) { expect(String(error)).not.toContain('invalid-secret'); }
  });

  it('allows exact production origins and native clients; allows only actual loopback origins in development', () => {
    expect(allowed('https://app.example')).toBe(true);
    expect(allowed('capacitor://localhost')).toBe(true);
    expect(allowed(undefined)).toBe(true);
    expect(allowed('http://localhost:5173')).toBe(false);
    expect(allowed('http://localhost:5173', 'development')).toBe(true);
    expect(allowed('http://[::1]:3000', 'development')).toBe(true);
    expect(allowed('http://localhost.evil.test', 'development')).toBe(false);
    expect(allowed('https://app.example.evil.test')).toBe(false);
    expect(allowed('null')).toBe(false);
  });
});
