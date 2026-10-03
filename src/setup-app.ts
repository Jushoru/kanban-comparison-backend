import { INestApplication, ValidationPipe } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { DocumentBuilder, SwaggerModule } from '@nestjs/swagger';
import { HttpExceptionFilter } from './common/http-exception.filter';
import { corsOptions } from './config/cors';

export function setupApp(app: INestApplication): void {
  const config = app.get(ConfigService);
  app.setGlobalPrefix('api');
  app.enableCors(corsOptions(config.get<string>('CORS_ORIGINS', ''), config.get<string>('NODE_ENV', 'development')));
  app.useGlobalPipes(new ValidationPipe({
    whitelist: true,
    forbidNonWhitelisted: true,
    transform: true,
    transformOptions: { enableImplicitConversion: false },
    validationError: { target: false, value: false },
  }));
  app.useGlobalFilters(new HttpExceptionFilter());
  const document = new DocumentBuilder()
    .setTitle('Kanban Comparison API')
    .setDescription('Fixed shared REST backend for React + Capacitor and React Native. JSON fields use camelCase; dates use UTC. IDs are opaque strings. Static users are reference data, not authenticated accounts. All application routes use /api. Reload a board after card mutations to obtain shifted positions.')
    .setVersion('1.0.0')
    .build();
  SwaggerModule.setup('docs', app, () => SwaggerModule.createDocument(app, document), {
    jsonDocumentUrl: '/docs-json',
    swaggerOptions: { persistAuthorization: false, displayRequestDuration: true },
  });
}
