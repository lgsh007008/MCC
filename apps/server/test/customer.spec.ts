import 'reflect-metadata';
import { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { hash } from '@node-rs/argon2';
import request from 'supertest';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type { CustomerInput } from '@mcc/shared';
import { AppModule } from '../src/app.module.js';
import { API_PREFIX } from '../src/common/api-prefix.js';
import { PrismaService } from '../src/common/prisma.service.js';

// 客户接口关键路径（契约/集成层，技术方案 §10）：
// 守卫 401 / 新建（编号格式、默认启用）/ 重名提示不阻断 / 列表筛选 /
// 启停用（停用不可开新单）/ 客户维度累计方量（未软删）。
// 使用一次性测试账号（it- 前缀）与客户名（it-customer- 前缀），测试结束清理。

describe('客户接口（契约/集成）', () => {
  let app: INestApplication;
  let prisma: PrismaService;
  let accessToken: string;
  const username = `it-customer-user-${Date.now()}`;
  const password = 'Secret#12345';
  const customerName = `it-customer-${Date.now()}`;

  const body = (): CustomerInput => ({
    name: customerName,
    contact: '13800000000',
    openingDebt: '0.00',
    note: '集成测试',
  });

  let customerId: string;

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
    await prisma.client.saleOrder.deleteMany({ where: { customerName: { startsWith: 'it-customer-' } } });
    await prisma.client.customer.deleteMany({ where: { name: { startsWith: 'it-customer-' } } });
    await prisma.client.user.deleteMany({ where: { username: { startsWith: 'it-customer-user-' } } });
    await prisma.client.eventLog.deleteMany({ where: { actorUsername: username } });
    await app.close();
  });

  const http = () => request(app.getHttpServer());
  const auth = (req: request.Test): request.Test => req.set('Authorization', `Bearer ${accessToken}`);

  it('未登录访问一律 401（守卫）', async () => {
    const res = await http().get(`/${API_PREFIX}/customers`);
    expect(res.status).toBe(401);
  });

  it('新建：编号 C + 5 位流水，默认启用', async () => {
    const res = await auth(http().post(`/${API_PREFIX}/customers`)).send(body());
    expect(res.status).toBe(201);
    expect(String(res.body.code)).toMatch(/^CT-\d{5}$/);
    expect(res.body.status).toBe('active');
    expect(res.body.name).toBe(customerName);
    customerId = res.body.id as string;
  });

  it('新建幂等：同 Idempotency-Key 不再重复建档（技术方案 §6.3）', async () => {
    const key = `it-customer-idem-${Date.now()}`;
    const name = `${customerName}-idem`;
    const first = await auth(http().post(`/${API_PREFIX}/customers`))
      .set('Idempotency-Key', key)
      .send({ ...body(), name });
    const second = await auth(http().post(`/${API_PREFIX}/customers`))
      .set('Idempotency-Key', key)
      .send({ ...body(), name });
    expect(first.status).toBe(201);
    expect(second.status).toBe(201);
    expect(second.body.id).toBe(first.body.id);
    expect(await prisma.client.customer.count({ where: { name } })).toBe(1);
  });

  it('重名：允许保存（不唯一），name-check 返回 duplicate', async () => {
    const second = await auth(http().post(`/${API_PREFIX}/customers`)).send(body());
    expect(second.status).toBe(201);
    expect(second.body.id).not.toBe(customerId);

    const check = await auth(http().get(`/${API_PREFIX}/customers/name-check`)).query({
      name: customerName,
    });
    expect(check.status).toBe(200);
    expect(check.body.duplicate).toBe(true);

    const excluded = await auth(http().get(`/${API_PREFIX}/customers/name-check`)).query({
      name: customerName,
      excludeId: customerId,
    });
    // 另一条同名档案仍存在，排除自身后依然重名
    expect(excluded.body.duplicate).toBe(true);
  });

  it('列表：按名称与状态筛选', async () => {
    const res = await auth(http().get(`/${API_PREFIX}/customers`)).query({
      name: customerName.slice(0, 12),
      status: 'active',
      page: 1,
      pageSize: 10,
    });
    expect(res.status).toBe(200);
    expect(Number(res.body.total)).toBeGreaterThanOrEqual(2);
    // 名称筛选为 contains：本次运行创建的客户（含 -idem）都应命中同一前缀
    expect(
      res.body.items.every((item: { name: string }) => item.name.startsWith(customerName)),
    ).toBe(true);
  });

  it('更新：名称、联系信息、备注', async () => {
    const res = await auth(http().put(`/${API_PREFIX}/customers/${customerId}`)).send({
      name: `${customerName}-改`,
      contact: '13900000000',
      note: '改后',
    });
    expect(res.status).toBe(200);
    expect(res.body.name).toBe(`${customerName}-改`);
    expect(res.body.contact).toBe('13900000000');
  });

  it('期初欠款：新建可填、更新可改、负数被拒绝', async () => {
    const created = await auth(http().post(`/${API_PREFIX}/customers`)).send({
      ...body(),
      name: `${customerName}-期初`,
      openingDebt: '100000.00',
    });
    expect(created.status).toBe(201);
    expect(created.body.openingDebt).toBe('100000.00');

    const updated = await auth(http().put(`/${API_PREFIX}/customers/${created.body.id}`)).send({
      name: `${customerName}-期初`,
      openingDebt: '80000.50',
    });
    expect(updated.status).toBe(200);
    expect(updated.body.openingDebt).toBe('80000.50');

    const invalid = await auth(http().put(`/${API_PREFIX}/customers/${created.body.id}`)).send({
      name: `${customerName}-期初`,
      openingDebt: '-1.00',
    });
    expect(invalid.status).toBe(400);

    const detail = await auth(http().get(`/${API_PREFIX}/customers/${created.body.id}`));
    expect(detail.body.openingDebt).toBe('80000.50');
  });

  it('停用：不可开新单；重新启用后可开单', async () => {
    const created = await auth(http().post(`/${API_PREFIX}/sale-orders`)).send({
      saleDate: '2026-11-09',
      customerId,
      otherAmount: '0',
      note: '',
      items: [
        {
          lengthMm: 300,
          widthMm: 80,
          heightMm: 20,
          pieces: 3,
          pricingMode: 'volume',
          price: '550.25',
          otherAmount: '0',
          note: '',
        },
      ],
    });
    expect(created.status).toBe(201);

    const disabled = await auth(http().patch(`/${API_PREFIX}/customers/${customerId}/status`)).send({
      status: 'inactive',
    });
    expect(disabled.status).toBe(200);
    expect(disabled.body.status).toBe('inactive');

    const rejected = await auth(http().post(`/${API_PREFIX}/sale-orders`)).send({
      saleDate: '2026-11-09',
      customerId,
      otherAmount: '0',
      note: '',
      items: [
        {
          lengthMm: 300,
          widthMm: 80,
          heightMm: 20,
          pieces: 3,
          pricingMode: 'volume',
          price: '550.25',
          otherAmount: '0',
          note: '',
        },
      ],
    });
    expect(rejected.status).toBe(400);
    expect(rejected.body.code).toBe('CUSTOMER_INACTIVE');

    const enabled = await auth(http().patch(`/${API_PREFIX}/customers/${customerId}/status`)).send({
      status: 'active',
    });
    expect(enabled.status).toBe(200);
    expect(enabled.body.status).toBe('active');
  });

  it('批量状态：只更新需变更的行，跳过已处于目标状态与已删', async () => {
    const create = async (suffix: string): Promise<string> => {
      const res = await auth(http().post(`/${API_PREFIX}/customers`)).send({
        name: `${customerName}-批量-${suffix}`,
        contact: '',
        note: '',
      });
      expect(res.status).toBe(201);
      return res.body.id as string;
    };
    const first = await create('a');
    const second = await create('b');
    const third = await create('c');
    // 先把第三条停用，作为「已处于目标状态」的样本
    await auth(http().patch(`/${API_PREFIX}/customers/${third}/status`)).send({ status: 'inactive' });

    const disabled = await auth(http().post(`/${API_PREFIX}/customers/batch-status`)).send({
      ids: [first, second, third],
      status: 'inactive',
    });
    expect(disabled.status).toBe(200);
    expect(disabled.body.updated).toBe(2);

    const again = await auth(http().post(`/${API_PREFIX}/customers/batch-status`)).send({
      ids: [first, second, third],
      status: 'inactive',
    });
    expect(again.body.updated).toBe(0);

    const enabled = await auth(http().post(`/${API_PREFIX}/customers/batch-status`)).send({
      ids: [first, second, third],
      status: 'active',
    });
    expect(enabled.body.updated).toBe(3);
  });

  it('累计下单方量：未软删销售单合计，软删后归零', async () => {
    const summary = await auth(http().get(`/${API_PREFIX}/sale-orders/customer-volume-summary`)).query({
      customerIds: customerId,
    });
    expect(summary.status).toBe(200);
    expect(summary.body.items).toEqual([{ customerId, totalVolume: '0.0014', orderCount: 1 }]);

    const orders = await auth(http().get(`/${API_PREFIX}/sale-orders`)).query({
      customerId,
      page: 1,
      pageSize: 100,
    });
    for (const order of orders.body.items as Array<{ id: string }>) {
      const del = await auth(http().delete(`/${API_PREFIX}/sale-orders/${order.id}`));
      expect(del.status).toBe(204);
    }

    const after = await auth(http().get(`/${API_PREFIX}/sale-orders/customer-volume-summary`)).query({
      customerIds: customerId,
    });
    expect(after.body.items).toEqual([{ customerId, totalVolume: '0.0000', orderCount: 0 }]);
  });

  it('删除：软删除后列表不可见、不可开单，历史订单仍可读并标注已删除；批量删除跳过已删', async () => {
    const created = await auth(http().post(`/${API_PREFIX}/customers`)).send({
      name: `${customerName}-删除`,
      contact: '',
      note: '',
    });
    const targetId = created.body.id as string;
    const targetCode = created.body.code as string;

    const order = await auth(http().post(`/${API_PREFIX}/sale-orders`)).send({
      saleDate: '2026-11-09',
      customerId: targetId,
      otherAmount: '0',
      note: '',
      items: [
        {
          lengthMm: 300,
          widthMm: 80,
          heightMm: 20,
          pieces: 3,
          pricingMode: 'volume',
          price: '550.25',
          otherAmount: '0',
          note: '',
        },
      ],
    });
    expect(order.status).toBe(201);

    const removed = await auth(http().delete(`/${API_PREFIX}/customers/${targetId}`));
    expect(removed.status).toBe(204);

    const detail = await auth(http().get(`/${API_PREFIX}/customers/${targetId}`));
    expect(detail.status).toBe(404);

    const list = await auth(http().get(`/${API_PREFIX}/customers`)).query({
      name: `${customerName}-删除`,
      page: 1,
      pageSize: 20,
    });
    expect(list.body.total).toBe(0);

    // 已删客户不可再开单
    const rejected = await auth(http().post(`/${API_PREFIX}/sale-orders`)).send({
      saleDate: '2026-11-09',
      customerId: targetId,
      otherAmount: '0',
      note: '',
      items: [
        {
          lengthMm: 300,
          widthMm: 80,
          heightMm: 20,
          pieces: 3,
          pricingMode: 'volume',
          price: '550.25',
          otherAmount: '0',
          note: '',
        },
      ],
    });
    expect(rejected.status).toBe(400);
    expect(rejected.body.code).toBe('CUSTOMER_NOT_FOUND');

    // 历史订单仍可读：名称快照保留，编号标注已删除
    const orderDetail = await auth(http().get(`/${API_PREFIX}/sale-orders/${order.body.id}`));
    expect(orderDetail.status).toBe(200);
    expect(orderDetail.body.customerName).toBe(`${customerName}-删除`);
    expect(orderDetail.body.customerCode).toBe(targetCode);
    expect(orderDetail.body.customerDeleted).toBe(true);

    // 批量删除：已删行静默跳过
    const second = await auth(http().post(`/${API_PREFIX}/customers`)).send({
      name: `${customerName}-批量删`,
      contact: '',
      note: '',
    });
    const batch = await auth(http().post(`/${API_PREFIX}/customers/batch-delete`)).send({
      ids: [targetId, second.body.id],
    });
    expect(batch.status).toBe(200);
    expect(batch.body.deleted).toBe(1);
  });
});
