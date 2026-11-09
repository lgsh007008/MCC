import 'reflect-metadata';
import { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { hash } from '@node-rs/argon2';
import request from 'supertest';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import {
  calcBoardLineAmount,
  calcOrderTotals,
  calcVolumeM3,
  type SaleOrderInput,
} from '@mcc/shared';
import { AppModule } from '../src/app.module.js';
import { API_PREFIX } from '../src/common/api-prefix.js';
import { PrismaService } from '../src/common/prisma.service.js';

// 订单接口关键路径（契约/集成层，技术方案 §10）：
// 守卫 401 / 新建（计算落账、编号、幂等）/ 详情 / 列表筛选 / 更新重算 / 参数校验 / 软删除。
// 使用一次性测试账号（it- 前缀）与客户名（it-order- 前缀），测试结束清理。

describe('订单接口（契约/集成）', () => {
  let app: INestApplication;
  let prisma: PrismaService;
  let accessToken: string;
  const username = `it-order-user-${Date.now()}`;
  const password = 'Secret#12345';
  const customerName = `it-order-customer-${Date.now()}`;

  const boardVolume = calcVolumeM3('2.000', '80.000', '300.000', 3);

  const body = (): SaleOrderInput => ({
    saleDate: '2026-11-09',
    customerName,
    otherAmount: '0',
    note: '集成测试单',
    items: [
      {
        productType: 'board',
        thicknessCm: '2.000',
        widthCm: '80.000',
        lengthCm: '300.000',
        pieces: 3,
        price: '550.25',
        otherAmount: '0.50',
        note: '',
      },
      { productType: 'other', lineAmount: '5.00', otherAmount: '0', note: '托盘' },
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
  });

  afterAll(async () => {
    await prisma.client.saleOrder.deleteMany({ where: { customerName: { startsWith: 'it-order-' } } });
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

  it('新建：方量与金额自动落账、编号按月流水、明细编码 = 主单号-行序', async () => {
    const res = await http()
      .post(`/${API_PREFIX}/sale-orders`)
      .set('Authorization', `Bearer ${accessToken}`)
      .send(body());
    expect(res.status).toBe(201);
    expect(String(res.body.code)).toMatch(/^202611-\d{4}$/);
    expect(res.body.customerName).toBe(customerName);
    expect(res.body.totalVolume).toBe('0.1440');
    expect(res.body.totalAmount).toBe(
      calcOrderTotals(
        [
          { volumeM3: boardVolume, lineAmount: calcBoardLineAmount(boardVolume, '550.25'), otherAmount: '0.50' },
          { volumeM3: null, lineAmount: '5.00', otherAmount: '0.00' },
        ],
        '0.00',
      ).totalAmount,
    );
    expect(res.body.items).toHaveLength(2);
    expect(res.body.items[0].code).toBe(`${res.body.code}-01`);
    expect(res.body.items[0].volumeM3).toBe('0.1440');
    expect(res.body.items[1].productType).toBe('other');
    expect(res.body.items[1].lineAmount).toBe('5.00');
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

  it('列表：按客户名称筛选，响应含筛选全量汇总（合计行）', async () => {
    const res = await http()
      .get(`/${API_PREFIX}/sale-orders`)
      .set('Authorization', `Bearer ${accessToken}`)
      .query({ customerName: customerName.slice(0, 10), page: 1, pageSize: 10 });
    expect(res.status).toBe(200);
    expect(Number(res.body.total)).toBeGreaterThanOrEqual(1);
    expect(res.body.items.every((item: { customerName: string }) => item.customerName === customerName)).toBe(true);
    // summary 为筛选全量汇总（排除分页），金额/方量为定长格式化字符串
    expect(res.body.summary).toMatchObject({
      totalVolume: expect.stringMatching(/^\d+\.\d{4}$/),
      subtotalAmount: expect.stringMatching(/^\d+\.\d{2}$/),
      otherAmount: expect.stringMatching(/^\d+\.\d{2}$/),
      totalAmount: expect.stringMatching(/^\d+\.\d{2}$/),
    });
  });

  it('更新：明细重算、移除行软删', async () => {
    const detail = await http()
      .get(`/${API_PREFIX}/sale-orders/${created.id}`)
      .set('Authorization', `Bearer ${accessToken}`);
    const boardRow = detail.body.items.find((item: { productType: string }) => item.productType === 'board');
    const res = await http()
      .put(`/${API_PREFIX}/sale-orders/${created.id}`)
      .set('Authorization', `Bearer ${accessToken}`)
      .send({
        saleDate: '2026-11-09',
        customerName,
        otherAmount: '10.00',
        note: '集成测试单（改）',
        items: [
          {
            id: boardRow.id,
            productType: 'board',
            thicknessCm: '2.000',
            widthCm: '80.000',
            lengthCm: '300.000',
            pieces: 4,
            price: '550.25',
            otherAmount: '0.50',
            note: '',
          },
        ],
      });
    expect(res.status).toBe(200);
    expect(res.body.items).toHaveLength(1);
    const volume4 = calcVolumeM3('2.000', '80.000', '300.000', 4);
    expect(res.body.items[0].volumeM3).toBe(volume4);
    expect(res.body.totalAmount).toBe(
      calcOrderTotals(
        [
          {
            volumeM3: volume4,
            lineAmount: calcBoardLineAmount(volume4, '550.25'),
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

  it('参数校验：明细为空拒绝', async () => {
    const res = await http()
      .post(`/${API_PREFIX}/sale-orders`)
      .set('Authorization', `Bearer ${accessToken}`)
      .send({ ...body(), items: [] });
    expect(res.status).toBe(400);
    expect(res.body.code).toBe('VALIDATION_FAILED');
  });

  it('删除：软删除后详情与后续删除均为 404', async () => {
    const del = await http()
      .delete(`/${API_PREFIX}/sale-orders/${created.id}`)
      .set('Authorization', `Bearer ${accessToken}`);
    expect(del.status).toBe(204);

    const detail = await http()
      .get(`/${API_PREFIX}/sale-orders/${created.id}`)
      .set('Authorization', `Bearer ${accessToken}`);
    expect(detail.status).toBe(404);
    expect(detail.body.code).toBe('NOT_FOUND');

    const delAgain = await http()
      .delete(`/${API_PREFIX}/sale-orders/${created.id}`)
      .set('Authorization', `Bearer ${accessToken}`);
    expect(delAgain.status).toBe(404);
  });
});