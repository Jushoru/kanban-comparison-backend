import 'reflect-metadata';
import { NestFactory } from '@nestjs/core';
import { ConfigService } from '@nestjs/config';
import { AppModule } from './app.module';
import { setupApp } from './setup-app';

async function bootstrap(): Promise<void> {
  const app = await NestFactory.create(AppModule, { abortOnError: false });
  setupApp(app);
  app.enableShutdownHooks();
  await app.listen(app.get(ConfigService).get<number>('PORT', 3000), '0.0.0.0');
}

void bootstrap().catch(() => {
  console.error('Backend startup failed. Check environment configuration and port availability.');
  process.exitCode = 1;
});
