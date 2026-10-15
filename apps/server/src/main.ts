import 'reflect-metadata';
import { NestFactory } from '@nestjs/core';
import { AppModule } from './app.module';
import { API_PREFIX } from './common/api-prefix';

async function bootstrap(): Promise<void> {
  const app = await NestFactory.create(AppModule);

  app.setGlobalPrefix(API_PREFIX);

  const port = Number(process.env.PORT ?? 3001);
  await app.listen(port);
}

void bootstrap();
