import 'reflect-metadata';
import { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { hash } from '@node-rs/argon2';
import request from 'supertest';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { AppModule } from '../src/app.module.js';
import { API_PREFIX } from '../src/common/api-prefix.js';
import { PrismaService } from '../src/common/prisma.service.js';

// 供应商列表排序（design/supplier.md §5 / §6）：
// 创建日期表头正 / 倒序，默认倒序；两条档案显式设置不同创建时间以断言相对顺序。
// 使用一次性测试账号（it- 前缀）与供应商名（it-supplier- 前缀），测试结束清理。

describe('供应商列表排序（契约/集成）', () => {
  let app: INestApplication;
  let prisma: PrismaService;
  let accessToken: string;
  const username = `it-supplier-user-${Date.now()}`;
  const password = 'Secret#12345';
  const namePrefix = `it-supplier-${Date.now()}`;
  const olderName = `${namePrefix}-older`;
  const newerName = `${namePrefix}-newer`;

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({ imports: [AppModule] }).compile();
    app = moduleRef.createNestApplication();
    app.setGlobalPrefix(API_PREFIX);
    await app.init();
    prisma = app.get(PrismaService);
    await prisma.client.user.create({
      data: { username, passwordHash: await hash(password), role: 'SALES' },
    });
    const login = await request(app.getHttpServer()).post(`/${API_PREFIX}/auth/login`).send({
      username,
      password,
      rememberMe: false,
    });
    accessToken = login.body.accessToken as string;
  });

  afterAll(async () => {
    await prisma.client.supplier.deleteMany({ where: { name: { startsWith: 'it-supplier-' } } });
    await prisma.client.user.deleteMany({ where: { username: { startsWith: 'it-supplier-user-' } } });
    await prisma.client.eventLog.deleteMany({ where: { actorUsername: username } });
    await app.close();
  });

  const http = () => request(app.getHttpServer());
  const auth = (req: request.Test): request.Test => req.set('Authorization', `Bearer ${accessToken}`);

  it('sortOrder 按创建日期正 / 倒序返回，默认倒序', async () => {
    const older = await auth(http().post(`/${API_PREFIX}/suppliers`)).send({ name: olderName });
    const newer = await auth(http().post(`/${API_PREFIX}/suppliers`)).send({ name: newerName });
    expect(older.status).toBe(201);
    expect(newer.status).toBe(201);

    // 显式错开创建时间，避免同一毫秒插入导致顺序不确定
    await prisma.client.supplier.updateMany({
      where: { id: older.body.id as string },
      data: { createdAt: new Date('2026-01-01T00:00:00.000Z') },
    });
    await prisma.client.supplier.updateMany({
      where: { id: newer.body.id as string },
      data: { createdAt: new Date('2026-01-02T00:00:00.000Z') },
    });

    const asc = await auth(http().get(`/${API_PREFIX}/suppliers`)).query({
      name: namePrefix,
      sortBy: 'createdAt',
      sortOrder: 'asc',
      page: 1,
      pageSize: 10,
    });
    expect(asc.status).toBe(200);
    expect(asc.body.items.map((item: { name: string }) => item.name)).toEqual([olderName, newerName]);

    const desc = await auth(http().get(`/${API_PREFIX}/suppliers`)).query({
      name: namePrefix,
      sortBy: 'createdAt',
      sortOrder: 'desc',
      page: 1,
      pageSize: 10,
    });
    expect(desc.status).toBe(200);
    expect(desc.body.items.map((item: { name: string }) => item.name)).toEqual([newerName, olderName]);

    const fallback = await auth(http().get(`/${API_PREFIX}/suppliers`)).query({
      name: namePrefix,
      page: 1,
      pageSize: 10,
    });
    expect(fallback.status).toBe(200);
    expect(fallback.body.items.map((item: { name: string }) => item.name)).toEqual([
      newerName,
      olderName,
    ]);
  });
});
