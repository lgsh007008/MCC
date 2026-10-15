import 'reflect-metadata';
import { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import request from 'supertest';
import { describe, expect, it, afterAll, beforeAll } from 'vitest';
import { AppModule } from '../src/app.module';
import { API_PREFIX } from '../src/common/api-prefix';

// 脚手架自检用例：证明服务能装配、统一前缀生效（契约/集成层）。
// 每个领域的接口用例随需求写入 test/，与实现同目录演进。
describe('服务骨架（契约/集成）', () => {
  let app: INestApplication;

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({ imports: [AppModule] }).compile();
    app = moduleRef.createNestApplication();
    app.setGlobalPrefix(API_PREFIX);
    await app.init();
  });

  afterAll(async () => {
    await app.close();
  });

  it('根模块可装配，且未挂路由时统一前缀下返回 404', async () => {
    const res = await request(app.getHttpServer()).get(`/${API_PREFIX}`);
    expect(res.status).toBe(404);
  });
});
