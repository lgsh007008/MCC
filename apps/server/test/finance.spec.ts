import 'reflect-metadata';
import { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { hash } from '@node-rs/argon2';
import request from 'supertest';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { calcLineAmount, calcOrderTotals, calcVolumeM3 } from '@mcc/shared';
import { AppModule } from '../src/app.module.js';
import { API_PREFIX } from '../src/common/api-prefix.js';
import { PrismaService } from '../src/common/prisma.service.js';

// 财务接口关键路径（契约/集成层，技术方案 §10）：
// 手工事件（符号、编号、列表合计、汇总、更新、删除）+ 销售单联动（自动生成 / 编辑同步 / 删除软删 / 自动事件只读）。
// 使用独特日期（2030-01-xx），与订单等其他用例隔离；测试结束清理。

describe('财务接口（契约/集成）', () => {
  let app: INestApplication;
  let prisma: PrismaService;
  let accessToken: string;
  let customerId: string;
  const username = `it-finance-user-${Date.now()}`;
  const password = 'Secret#12345';
  const customerName = `it-finance-customer-${Date.now()}`;
  const manualDate = '2030-01-05';
  const orderDate = '2030-01-06';
  const createdOrderIds: string[] = [];

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
    const customer = await request(app.getHttpServer())
      .post(`/${API_PREFIX}/customers`)
      .set('Authorization', `Bearer ${accessToken}`)
      .send({ name: customerName, contact: '', note: '' });
    customerId = customer.body.id as string;
  });

  afterAll(async () => {
    const orders = await prisma.client.saleOrder.findMany({
      where: { customerId },
      select: { id: true },
    });
    await prisma.client.financeEvent.deleteMany({
      where: {
        sourceType: 'sale_order',
        sourceId: { in: [...orders.map((row) => row.id), ...createdOrderIds] },
      },
    });
    await prisma.client.financeEvent.deleteMany({ where: { occurredDate: new Date(`${manualDate}T00:00:00Z`) } });
    await prisma.client.saleOrder.deleteMany({ where: { customerId } });
    await prisma.client.customer.deleteMany({ where: { name: { startsWith: 'it-finance-' } } });
    await prisma.client.user.deleteMany({ where: { username: { startsWith: 'it-finance-user-' } } });
    await prisma.client.eventLog.deleteMany({ where: { actorUsername: username } });
    await app.close();
  });

  const http = () => request(app.getHttpServer());
  const auth = (req: request.Test): request.Test => req.set('Authorization', `Bearer ${accessToken}`);

  let manualEventId: string;

  it('手工记账：有符号金额（支出为负）、来源手工、编号按月流水', async () => {
    const res = await auth(http().post(`/${API_PREFIX}/finance/events`)).send({
      category: 'other_expense',
      occurredDate: manualDate,
      amount: '100.50',
      note: '维修裁板锯',
    });
    expect(res.status).toBe(201);
    expect(res.body.amount).toBe('-100.50');
    expect(res.body.source).toBe('manual');
    expect(String(res.body.code)).toMatch(/^FN-\d{5}$/);
    manualEventId = res.body.id as string;
  });

  it('列表：按日期筛选，响应含筛选全量金额合计', async () => {
    const res = await auth(http().get(`/${API_PREFIX}/finance/events`)).query({
      dateFrom: manualDate,
      dateTo: manualDate,
      page: 1,
      pageSize: 20,
    });
    expect(res.status).toBe(200);
    expect(Number(res.body.total)).toBe(1);
    expect(res.body.summary.amount).toBe('-100.50');
    expect(res.body.items[0]).toMatchObject({ category: 'other_expense', source: 'manual' });
  });

  it('收支汇总：总成本、净利润、分类小计（实时聚合）', async () => {
    const res = await auth(http().get(`/${API_PREFIX}/finance/summary`)).query({
      dateFrom: manualDate,
      dateTo: manualDate,
    });
    expect(res.status).toBe(200);
    expect(res.body).toMatchObject({
      totalIncome: '0.00',
      totalCost: '100.50',
      netProfit: '-100.50',
      eventCount: 1,
    });
    const otherExpense = (res.body.categories as Array<{ category: string; cost: string; net: string }>).find(
      (row) => row.category === 'other_expense',
    );
    expect(otherExpense).toMatchObject({ cost: '100.50', net: '-100.50' });
  });

  it('更新：金额按分类重新规范化符号', async () => {
    const res = await auth(http().put(`/${API_PREFIX}/finance/events/${manualEventId}`)).send({
      category: 'other_expense',
      occurredDate: manualDate,
      amount: '200.00',
      note: '维修裁板锯（改）',
    });
    expect(res.status).toBe(200);
    expect(res.body.amount).toBe('-200.00');
  });

  it('删除：手工事件软删后列表不可见', async () => {
    const del = await auth(http().delete(`/${API_PREFIX}/finance/events/${manualEventId}`));
    expect(del.status).toBe(204);
    const list = await auth(http().get(`/${API_PREFIX}/finance/events`)).query({
      dateFrom: manualDate,
      dateTo: manualDate,
    });
    expect(Number(list.body.total)).toBe(0);
  });

  it('销售单联动：创建生成收入事件、编辑同步、删除软删、自动事件只读', async () => {
    const orderRes = await auth(http().post(`/${API_PREFIX}/sale-orders`)).send({
      saleDate: orderDate,
      customerId,
      otherAmount: '0',
      note: '财务联动测试',
      items: [
        {
          lengthMm: 3000,
          widthMm: 100,
          heightMm: 20,
          pieces: 10,
          pricingMode: 'volume',
          price: '600.00',
          otherAmount: '0',
          note: '',
        },
      ],
    });
    expect(orderRes.status).toBe(201);
    const order = orderRes.body as {
      id: string;
      code: string;
      totalAmount: string;
      items: Array<{ id: string }>;
    };
    createdOrderIds.push(order.id);

    const volume = calcVolumeM3(3000, 100, 20, 10);
    const lineAmount = calcLineAmount('volume', volume, 10, '600.00');
    const total = calcOrderTotals([{ volumeM3: volume, lineAmount, otherAmount: '0' }], '0').totalAmount;
    expect(order.totalAmount).toBe(total);

    // 自动生成销售收入事件（按源单编号定位）
    const list = await auth(http().get(`/${API_PREFIX}/finance/events`)).query({
      dateFrom: orderDate,
      dateTo: orderDate,
      source: 'auto',
      pageSize: 100,
    });
    const event = (list.body.items as Array<Record<string, string | null>>).find(
      (row) => row.sourceCode === order.code,
    );
    if (!event) {
      throw new Error('未找到销售单自动生成的收入事件');
    }
    expect(event).toMatchObject({
      category: 'sales_revenue',
      amount: total,
      source: 'auto',
      sourceCode: order.code,
      sourceId: order.id,
    });

    // 自动事件在财务侧不可删
    const eventId = event.id as string;
    const denied = await auth(http().delete(`/${API_PREFIX}/finance/events/${eventId}`));
    expect(denied.status).toBe(400);
    expect(denied.body.code).toBe('AUTO_EVENT_READONLY');

    // 编辑销售单 → 事件金额 / 日期 / 备注同步
    const volume2 = calcVolumeM3(3000, 100, 20, 20);
    const lineAmount2 = calcLineAmount('volume', volume2, 20, '600.00');
    const total2 = calcOrderTotals(
      [{ volumeM3: volume2, lineAmount: lineAmount2, otherAmount: '0' }],
      '0',
    ).totalAmount;
    const update = await auth(http().put(`/${API_PREFIX}/sale-orders/${order.id}`)).send({
      saleDate: orderDate,
      customerId,
      otherAmount: '0',
      note: '财务联动测试（改）',
      items: [
        {
          id: order.items[0]?.id,
          lengthMm: 3000,
          widthMm: 100,
          heightMm: 20,
          pieces: 20,
          pricingMode: 'volume',
          price: '600.00',
          otherAmount: '0',
          note: '',
        },
      ],
    });
    expect(update.status).toBe(200);
    expect(update.body.totalAmount).toBe(total2);
    const eventDetail = await auth(http().get(`/${API_PREFIX}/finance/events/${eventId}`));
    expect(eventDetail.body.amount).toBe(total2);

    // 删除销售单 → 事件一并软删
    const del = await auth(http().delete(`/${API_PREFIX}/sale-orders/${order.id}`));
    expect(del.status).toBe(204);
    const eventAfter = await auth(http().get(`/${API_PREFIX}/finance/events/${eventId}`));
    expect(eventAfter.status).toBe(404);
  });
});
