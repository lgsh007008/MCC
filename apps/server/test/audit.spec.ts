import 'reflect-metadata';
import { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { Prisma } from '@mcc/db';
import { hash } from '@node-rs/argon2';
import request from 'supertest';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { AppModule } from '../src/app.module.js';
import { API_PREFIX } from '../src/common/api-prefix.js';
import { PrismaService } from '../src/common/prisma.service.js';
import { RedisService } from '../src/common/redis.service.js';

// 审计日志（product/审计日志.md R-审计-001；design/审计日志.md §8）：
// 写操作成功 / 失败、登录成功 / 失败、权限拒绝、打印均落库；非管理员查询 403；响应不含敏感 payload。
// 审计只增不删，测试按唯一账号名清理本用例产生的行。

describe('审计日志（契约/集成）', () => {
  let app: INestApplication;
  let prisma: PrismaService;
  let redis: RedisService;
  const stamp = Date.now();
  const adminUsername = `it-audit-admin-${stamp}`;
  const salesUsername = `it-audit-sales-${stamp}`;
  const customerName = `it-audit-customer-${stamp}`;
  const password = 'Secret#12345';
  let adminToken = '';
  let salesToken = '';

  const waitForLog = async (
    where: Prisma.EventLogWhereInput,
  ): Promise<Prisma.EventLogGetPayload<object>> => {
    const start = Date.now();
    while (Date.now() - start < 3_000) {
      const row = await prisma.client.eventLog.findFirst({
        where,
        orderBy: { createdAt: 'desc' },
      });
      if (row) {
        return row;
      }
      await new Promise((resolve) => setTimeout(resolve, 30));
    }
    throw new Error(`未等到审计记录：${JSON.stringify(where)}`);
  };

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({ imports: [AppModule] }).compile();
    app = moduleRef.createNestApplication();
    app.setGlobalPrefix(API_PREFIX);
    await app.init();
    prisma = app.get(PrismaService);
    redis = app.get(RedisService);
    const rateKeys = await redis.keys('rate:*');
    if (rateKeys.length > 0) {
      await redis.del(...rateKeys);
    }
    await prisma.client.user.createMany({
      data: [
        {
          username: adminUsername,
          passwordHash: await hash(password),
          role: 'ADMIN',
        },
        {
          username: salesUsername,
          passwordHash: await hash(password),
          role: 'SALES',
        },
      ],
    });
    const adminLogin = await request(app.getHttpServer())
      .post(`/${API_PREFIX}/auth/login`)
      .send({ username: adminUsername, password, rememberMe: false });
    adminToken = adminLogin.body.accessToken as string;
    const salesLogin = await request(app.getHttpServer())
      .post(`/${API_PREFIX}/auth/login`)
      .send({ username: salesUsername, password, rememberMe: false });
    salesToken = salesLogin.body.accessToken as string;
  });

  afterAll(async () => {
    await prisma.client.saleOrder.deleteMany({
      where: { customerName: { startsWith: 'it-audit-customer-' } },
    });
    await prisma.client.customer.deleteMany({ where: { name: { startsWith: 'it-audit-customer-' } } });
    await prisma.client.user.deleteMany({
      where: { username: { startsWith: 'it-audit-' } },
    });
    await prisma.client.eventLog.deleteMany({
      where: { actorUsername: { startsWith: 'it-audit-' } },
    });
    await app.close();
  });

  const http = () => request(app.getHttpServer());
  const asAdmin = (req: request.Test): request.Test =>
    req.set('Authorization', `Bearer ${adminToken}`);
  const asSales = (req: request.Test): request.Test =>
    req.set('Authorization', `Bearer ${salesToken}`);

  it('登录成功落审计（含角色快照）', async () => {
    const row = await waitForLog({
      actorUsername: adminUsername,
      domain: 'auth',
      action: 'login',
      result: 'ok',
    });
    expect(row.actorRole).toBe('ADMIN');
    expect(row.actionLabel).toBe('登录');
  });

  it('登录失败落审计，不记录密码', async () => {
    const ghost = `it-audit-ghost-${stamp}`;
    const res = await http()
      .post(`/${API_PREFIX}/auth/login`)
      .send({ username: ghost, password: 'wrong-password', rememberMe: false });
    expect(res.status).toBe(401);
    const row = await waitForLog({
      actorUsername: ghost,
      domain: 'auth',
      action: 'login',
      result: 'failed',
    });
    expect(row.actorId).toBeNull();
    expect(row.statusCode).toBe(401);
    expect(JSON.stringify(row)).not.toContain('wrong-password');
  });

  it('写操作成功落审计，带对象编号；查询不返回 payload', async () => {
    const res = await asAdmin(http().post(`/${API_PREFIX}/customers`)).send({
      name: customerName,
      contact: '',
      note: '',
    });
    expect(res.status).toBe(201);

    const row = await waitForLog({
      actorUsername: adminUsername,
      domain: 'customer',
      action: 'create',
      result: 'ok',
    });
    expect(row.objectType).toBe('customer');
    expect(row.objectCode).toBe(res.body.code);
    expect(row.actionLabel).toBe('新建客户');

    const list = await asAdmin(http().get(`/${API_PREFIX}/audit-logs`)).query({
      actor: adminUsername,
      domain: 'customer',
      action: 'create',
      result: 'ok',
      page: 1,
      pageSize: 20,
    });
    expect(list.status).toBe(200);
    expect(list.body.total).toBeGreaterThanOrEqual(1);
    expect(list.body.items[0]).not.toHaveProperty('payload');
    expect(list.body.items[0].actorUsername).toBe(adminUsername);
  });

  it('写操作失败落审计（校验 400）', async () => {
    const res = await asAdmin(http().post(`/${API_PREFIX}/customers`)).send({ name: '' });
    expect(res.status).toBe(400);
    const row = await waitForLog({
      actorUsername: adminUsername,
      domain: 'customer',
      action: 'create',
      result: 'failed',
      statusCode: 400,
    });
    expect(row.actionLabel).toBe('新建客户');
  });

  it('权限拒绝（守卫 403）落审计', async () => {
    const res = await asSales(http().post(`/${API_PREFIX}/users`)).send({
      username: `it-audit-blocked-${stamp}`,
      password,
      role: 'WORKER',
    });
    expect(res.status).toBe(403);
    const row = await waitForLog({
      actorUsername: salesUsername,
      domain: 'auth',
      action: 'create-user',
      result: 'failed',
      statusCode: 403,
    });
    expect(row.errorCode).toBe('FORBIDDEN');
  });

  it('打印销售单落审计，对象为单据编号', async () => {
    const customer = await asAdmin(http().post(`/${API_PREFIX}/customers`)).send({
      name: `it-audit-customer-print-${stamp}`,
      contact: '',
      note: '',
    });
    const order = await asAdmin(http().post(`/${API_PREFIX}/sale-orders`)).send({
      saleDate: new Date().toISOString().slice(0, 10),
      customerId: customer.body.id,
      otherAmount: '0',
      note: '',
      items: [
        {
          lengthMm: 3000,
          widthMm: 100,
          heightMm: 20,
          pieces: 1,
          pricingMode: 'volume',
          price: '500.00',
          otherAmount: '0',
          note: '',
        },
      ],
    });
    expect(order.status).toBe(201);

    const printed = await asAdmin(
      http().post(`/${API_PREFIX}/sale-orders/${order.body.id}/print-events`),
    );
    expect(printed.status).toBe(200);
    const row = await waitForLog({
      actorUsername: adminUsername,
      domain: 'order',
      action: 'print',
      result: 'ok',
      objectId: order.body.id,
    });
    expect(row.objectCode).toBe(order.body.code);
    expect(row.actionLabel).toBe('打印销售单');
  });

  it('非管理员查询审计日志返回 403', async () => {
    const res = await asSales(http().get(`/${API_PREFIX}/audit-logs`));
    expect(res.status).toBe(403);
  });
});
