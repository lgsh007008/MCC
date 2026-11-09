import 'dotenv/config';
import 'reflect-metadata';
import cookieParser from 'cookie-parser';
import { NestFactory } from '@nestjs/core';
import { SwaggerModule } from '@nestjs/swagger';
import { AppModule } from './app.module.js';
import { API_PREFIX } from './common/api-prefix.js';
import { AppLogger } from './common/app.logger.js';
import { GlobalExceptionFilter } from './common/global-exception.filter.js';
import { requestIdMiddleware } from './common/request-id.middleware.js';
import { buildApiDocument } from './common/swagger.js';

async function bootstrap(): Promise<void> {
  const app = await NestFactory.create(AppModule, { logger: new AppLogger() });

  app.setGlobalPrefix(API_PREFIX);
  // 刷新令牌走 httpOnly Cookie（design/账号与权限.md §4），需解析 Cookie 请求头
  app.use(cookieParser());

  // requestId 上下文（技术方案 §9.2）：需在路由与守卫之前注册
  app.use(requestIdMiddleware);

  // 全局异常兜底（技术方案 §6.4）：HttpException 保留原统一错误体，未预期异常收敛为 500 统一错误体
  app.useGlobalFilters(new GlobalExceptionFilter());

  // OpenAPI 契约由装饰器代码生成（ADR-006）；构建出口统一收敛在 common/swagger.ts，
  // openapi.json 导出见 scripts/gen-openapi.ts
  const document = buildApiDocument(app);
  SwaggerModule.setup('api/docs', app, document);

  const port = Number(process.env.PORT ?? 3001);
  await app.listen(port);
}

void bootstrap();