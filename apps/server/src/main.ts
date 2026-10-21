import 'dotenv/config';
import 'reflect-metadata';
import cookieParser from 'cookie-parser';
import { NestFactory } from '@nestjs/core';
import { DocumentBuilder, SwaggerModule } from '@nestjs/swagger';
import { AppModule } from './app.module.js';
import { API_PREFIX } from './common/api-prefix.js';

async function bootstrap(): Promise<void> {
  const app = await NestFactory.create(AppModule);

  app.setGlobalPrefix(API_PREFIX);
  // 刷新令牌走 httpOnly Cookie（design/账号与权限.md §4），需解析 Cookie 请求头
  app.use(cookieParser());

  // OpenAPI 契约由装饰器代码生成（ADR-006）；openapi.json 导出见 scripts/gen-openapi.ts
  const config = new DocumentBuilder()
    .setTitle('MCC 业务 API')
    .setDescription('梅好木业数字化系统统一业务 API（ADR-002：人与 Agent 平级消费同一套接口）')
    .setVersion('v1')
    .addTag('auth', '账号与权限')
    .build();
  const document = SwaggerModule.createDocument(app, config);
  SwaggerModule.setup('api/docs', app, document);

  const port = Number(process.env.PORT ?? 3001);
  await app.listen(port);
}

void bootstrap();