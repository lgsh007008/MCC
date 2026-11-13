import 'reflect-metadata';
import { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { hash } from '@node-rs/argon2';
import request from 'supertest';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import {
  calcLineAmount,
  calcOrderTotals,
  calcVolumeM3,
  type SaleOrderInput,
} from '@mcc/shared';
import { AppModule } from '../src/app.module.js';
import { API_PREFIX } from '../src/common/api-prefix.js';
import { PrismaService } from '../src/common/prisma.service.js';

// 订单接口关键路径（契约/集成层，技术方案 §10）：
// 守卫 401 / 新建（两种计价、计算落账、编号、幂等）/ 详情 / 列表筛选 / 更新重算 / 参数校验 / 软删除。
// 使用一次性测试账号（it- 前缀）与客户名（it-order- 前缀），测试结束清理。

describe('订单接口（契约/集成）', () => {
  let app: INestApplication;
  let prisma: PrismaService;
  let accessToken: string;
  let customerId: string;
  const username = `it-order-user-${Date.now()}`;
  const password = 'Secret#12345';
  const customerName = `it-order-customer-${Date.now()}`;

  const volumeLine = calcVolumeM3(300, 80, 20, 3);
  const pieceVolume = calcVolumeM3(3000, 100, 20, 10);

  const body = (): SaleOrderInput => ({
    saleDate: '2026-11-09',
    customerId,
    otherAmount: '0',
    note: '集成测试单',
    settlementMode: 'credit',
    items: [
      {
        lengthMm: 300,
        widthMm: 80,
        heightMm: 20,
        pieces: 3,
        pricingMode: 'volume',
        price: '550.25',
        otherAmount: '0.50',
        note: '',
      },
      {
        lengthMm: 3000,
        widthMm: 100,
        heightMm: 20,
        pieces: 10,
        pricingMode: 'piece',
        price: '40.00',
        otherAmount: '0',
        note: '按根数',
      },
    ],
  });

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
    // 客户档案由 customer 接口创建（order 只接受客户外键）
    const customer = await request(app.getHttpServer())
      .post(`/${API_PREFIX}/customers`)
      .set('Authorization', `Bearer ${accessToken}`)
      .send({ name: customerName, contact: '13800000000', note: '' });
    customerId = customer.body.id as string;
  });

  afterAll(async () => {
    // 现结订单会联动生成收款流水（design/finance.md §6），先按源单清理再删订单
    const orders = await prisma.client.saleOrder.findMany({
      where: { customerId },
      select: { id: true },
    });
    await prisma.client.financeCashEntry.deleteMany({
      where: { sourceType: 'sale_order', sourceId: { in: orders.map((row) => row.id) } },
    });
    await prisma.client.saleOrder.deleteMany({ where: { customerId } });
    await prisma.client.customer.deleteMany({ where: { name: { startsWith: 'it-order-' } } });
    await prisma.client.user.deleteMany({ where: { username: { startsWith: 'it-order-user-' } } });
    await prisma.client.eventLog.deleteMany({ where: { actorUsername: username } });
    await app.close();
  });

  const http = () => request(app.getHttpServer());

  it('未登录访问一律 401（守卫）', async () => {
    const res = await http().get(`/${API_PREFIX}/sale-orders`);
    expect(res.status).toBe(401);
  });

  let created: { id: string; code: string };

  it('新建：两种计价混用、方量都计算、金额按计价方式落账、编号按月流水', async () => {
    const res = await http()
      .post(`/${API_PREFIX}/sale-orders`)
      .set('Authorization', `Bearer ${accessToken}`)
      .send(body());
    expect(res.status).toBe(201);
    expect(String(res.body.code)).toMatch(/^SO-\d{5}$/);
    expect(res.body.customerName).toBe(customerName);

    const line1 = calcLineAmount('volume', volumeLine, 3, '550.25');
    const line2 = calcLineAmount('piece', pieceVolume, 10, '40.00');
    expect(res.body.totalVolume).toBe(calcOrderTotals(
      [
        { volumeM3: volumeLine, lineAmount: line1, otherAmount: '0.50' },
        { volumeM3: pieceVolume, lineAmount: line2, otherAmount: '0.00' },
      ],
      '0.00',
    ).totalVolume);
    expect(res.body.totalAmount).toBe(
      calcOrderTotals(
        [
          { volumeM3: volumeLine, lineAmount: line1, otherAmount: '0.50' },
          { volumeM3: pieceVolume, lineAmount: line2, otherAmount: '0.00' },
        ],
        '0.00',
      ).totalAmount,
    );
    expect(res.body.items).toHaveLength(2);
    expect(res.body.items[0].code).toBe(`${res.body.code}-01`);
    expect(res.body.items[0].productType).toBe('square_timber');
    expect(res.body.items[0].pricingMode).toBe('volume');
    expect(res.body.items[0].heightMm).toBe(20);
    expect(res.body.items[0].volumeM3).toBe(volumeLine);
    expect(res.body.items[1].pricingMode).toBe('piece');
    expect(res.body.items[1].volumeM3).toBe(pieceVolume);
    expect(res.body.items[1].lineAmount).toBe(line2);
    created = { id: res.body.id, code: res.body.code };
  });

  it('新建幂等：同 Idempotency-Key 不再重复建单', async () => {
    const key = `it-key-${Date.now()}`;
    const first = await http()
      .post(`/${API_PREFIX}/sale-orders`)
      .set('Authorization', `Bearer ${accessToken}`)
      .set('Idempotency-Key', key)
      .send(body());
    const second = await http()
      .post(`/${API_PREFIX}/sale-orders`)
      .set('Authorization', `Bearer ${accessToken}`)
      .set('Idempotency-Key', key)
      .send(body());
    expect(second.status).toBe(201);
    expect(second.body.id).toBe(first.body.id);
    expect(second.body.code).toBe(first.body.code);
  });

  it('列表：按客户筛选，响应含筛选全量汇总（合计行）', async () => {
    const res = await http()
      .get(`/${API_PREFIX}/sale-orders`)
      .set('Authorization', `Bearer ${accessToken}`)
      .query({ customerId, page: 1, pageSize: 10 });
    expect(res.status).toBe(200);
    expect(Number(res.body.total)).toBeGreaterThanOrEqual(1);
    expect(res.body.items.every((item: { customerId: string }) => item.customerId === customerId)).toBe(true);
    // summary 为筛选全量汇总（排除分页），金额/方量为定长格式化字符串
    expect(res.body.summary).toMatchObject({
      totalVolume: expect.stringMatching(/^\d+\.\d{4}$/),
      subtotalAmount: expect.stringMatching(/^\d+\.\d{2}$/),
      otherAmount: expect.stringMatching(/^\d+\.\d{2}$/),
      totalAmount: expect.stringMatching(/^\d+\.\d{2}$/),
    });
  });

  it('列表：按客户名称快照模糊筛选（移动端搜索）', async () => {
    const hit = await http()
      .get(`/${API_PREFIX}/sale-orders`)
      .set('Authorization', `Bearer ${accessToken}`)
      .query({ customerName, page: 1, pageSize: 50 });
    expect(hit.status).toBe(200);
    expect(Number(hit.body.total)).toBeGreaterThanOrEqual(1);
    expect(
      hit.body.items.every((item: { customerName: string }) =>
        item.customerName.includes(customerName),
      ),
    ).toBe(true);

    const miss = await http()
      .get(`/${API_PREFIX}/sale-orders`)
      .set('Authorization', `Bearer ${accessToken}`)
      .query({ customerName: `不存在-${Date.now()}`, page: 1, pageSize: 50 });
    expect(miss.status).toBe(200);
    expect(Number(miss.body.total)).toBe(0);
  });

  it('更新：明细重算、计价方式可切换、移除行软删', async () => {
    const detail = await http()
      .get(`/${API_PREFIX}/sale-orders/${created.id}`)
      .set('Authorization', `Bearer ${accessToken}`);
    const firstRow = detail.body.items[0];
    const res = await http()
      .put(`/${API_PREFIX}/sale-orders/${created.id}`)
      .set('Authorization', `Bearer ${accessToken}`)
      .send({
        saleDate: '2026-11-09',
        customerId,
        otherAmount: '10.00',
        note: '集成测试单（改）',
        items: [
          {
            id: firstRow.id,
            lengthMm: 300,
            widthMm: 80,
            heightMm: 20,
            pieces: 4,
            pricingMode: 'piece',
            price: '12.50',
            otherAmount: '0.50',
            note: '',
          },
        ],
      });
    expect(res.status).toBe(200);
    expect(res.body.items).toHaveLength(1);
    const volume4 = calcVolumeM3(300, 80, 20, 4);
    expect(res.body.items[0].volumeM3).toBe(volume4);
    expect(res.body.items[0].pricingMode).toBe('piece');
    expect(res.body.items[0].lineAmount).toBe(calcLineAmount('piece', volume4, 4, '12.50'));
    expect(res.body.totalAmount).toBe(
      calcOrderTotals(
        [
          {
            volumeM3: volume4,
            lineAmount: calcLineAmount('piece', volume4, 4, '12.50'),
            otherAmount: '0.50',
          },
        ],
        '10.00',
      ).totalAmount,
    );
  });

  it('批量删除：一次软删多条，已删行详情 404', async () => {
    const create = () =>
      http()
        .post(`/${API_PREFIX}/sale-orders`)
        .set('Authorization', `Bearer ${accessToken}`)
        .send(body());
    const first = await create();
    const second = await create();
    const res = await http()
      .post(`/${API_PREFIX}/sale-orders/batch-delete`)
      .set('Authorization', `Bearer ${accessToken}`)
      .send({ ids: [first.body.id, second.body.id] });
    expect(res.status).toBe(200);
    expect(res.body.deleted).toBe(2);

    const detail = await http()
      .get(`/${API_PREFIX}/sale-orders/${first.body.id}`)
      .set('Authorization', `Bearer ${accessToken}`);
    expect(detail.status).toBe(404);
  });

  it('参数校验：明细为空、尺寸非整数均拒绝', async () => {
    const empty = await http()
      .post(`/${API_PREFIX}/sale-orders`)
      .set('Authorization', `Bearer ${accessToken}`)
      .send({ ...body(), items: [] });
    expect(empty.status).toBe(400);
    expect(empty.body.code).toBe('VALIDATION_FAILED');

    const decimalMm = await http()
      .post(`/${API_PREFIX}/sale-orders`)
      .set('Authorization', `Bearer ${accessToken}`)
      .send({
        ...body(),
        items: [{ ...body().items[0], heightMm: 20.5 }],
      });
    expect(decimalMm.status).toBe(400);
    expect(decimalMm.body.code).toBe('VALIDATION_FAILED');
  });

  it('删除：软删除后详情、列表与后续删除均不可见', async () => {
    const before = await http()
      .get(`/${API_PREFIX}/sale-orders`)
      .query({ page: 1, pageSize: 20, customerId })
      .set('Authorization', `Bearer ${accessToken}`);
    expect(before.status).toBe(200);

    const del = await http()
      .delete(`/${API_PREFIX}/sale-orders/${created.id}`)
      .set('Authorization', `Bearer ${accessToken}`);
    expect(del.status).toBe(204);

    const detail = await http()
      .get(`/${API_PREFIX}/sale-orders/${created.id}`)
      .set('Authorization', `Bearer ${accessToken}`);
    expect(detail.status).toBe(404);
    expect(detail.body.code).toBe('NOT_FOUND');

    const listed = await http()
      .get(`/${API_PREFIX}/sale-orders`)
      .query({ page: 1, pageSize: 20, customerId })
      .set('Authorization', `Bearer ${accessToken}`);
    expect(listed.status).toBe(200);
    expect(listed.body.total).toBe(before.body.total - 1);
    expect(
      listed.body.items.some((item: { id: string }) => item.id === created.id),
    ).toBe(false);

    const delAgain = await http()
      .delete(`/${API_PREFIX}/sale-orders/${created.id}`)
      .set('Authorization', `Bearer ${accessToken}`);
    expect(delAgain.status).toBe(404);
  });
});
