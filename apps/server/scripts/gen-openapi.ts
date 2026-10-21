import 'dotenv/config';
import 'reflect-metadata';
import { writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { NestFactory } from '@nestjs/core';
import { DocumentBuilder, SwaggerModule } from '@nestjs/swagger';
import { AppModule } from '../src/app.module.js';
import { API_PREFIX } from '../src/common/api-prefix.js';

// OpenAPI 契约生成（ADR-006：契约由装饰器代码生成，禁止手写接口文档）。
// 产出 packages/shared/openapi.json，随后由 shared 的 gen:client 生成类型化 client。
// 运行：pnpm --filter @mcc/server run gen:openapi

const app = await NestFactory.create(AppModule);
app.setGlobalPrefix(API_PREFIX);

const config = new DocumentBuilder()
  .setTitle('MCC 业务 API')
  .setDescription('梅好木业数字化系统统一业务 API（ADR-002：人与 Agent 平级消费同一套接口）')
  .setVersion('v1')
  .addTag('auth', '账号与权限')
  .build();
const document = SwaggerModule.createDocument(app, config);

const outPath = fileURLToPath(new URL('../../../packages/shared/openapi.json', import.meta.url));
writeFileSync(outPath, `${JSON.stringify(document, null, 2)}\n`);
console.log(`openapi.json written: ${outPath}`);

await app.close();