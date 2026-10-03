import { CorsOptions } from '@nestjs/common/interfaces/external/cors-options.interface';

export function corsOptions(origins: string, nodeEnv: string): CorsOptions {
  const allowed = new Set(origins.split(',').map((origin) => origin.trim()).filter(Boolean));
  return {
    origin: (origin, callback) => {
      const localhost = nodeEnv !== 'production'
        && /^https?:\/\/(localhost|127\.0\.0\.1|\[::1\])(?::\d+)?$/.test(origin ?? '');
      callback(null, !origin || allowed.has(origin) || localhost);
    },
    methods: ['GET', 'POST', 'PATCH', 'DELETE', 'OPTIONS'],
    allowedHeaders: ['Content-Type', 'Accept'],
    credentials: false,
    maxAge: 600,
  };
}
