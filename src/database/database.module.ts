import { Global, Module } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Environment } from '../config/environment';
import { DatabaseService } from './database.service';
import { createPool, DATABASE_POOL } from './pool';

@Global()
@Module({
  providers: [
    {
      provide: DATABASE_POOL,
      inject: [ConfigService],
      useFactory: (config: ConfigService<Environment, true>) => createPool({
        DATABASE_URL: config.get('DATABASE_URL', { infer: true }),
        DB_POOL_MAX: config.get('DB_POOL_MAX', { infer: true }),
        DB_SSL_CA: config.get('DB_SSL_CA', { infer: true }),
        PORT: config.get('PORT', { infer: true }),
        CORS_ORIGINS: config.get('CORS_ORIGINS', { infer: true }),
        NODE_ENV: config.get('NODE_ENV', { infer: true }),
      }),
    },
    DatabaseService,
  ],
  exports: [DatabaseService],
})
export class DatabaseModule {}
