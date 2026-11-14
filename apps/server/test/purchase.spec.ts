import 'reflect-metadata';
import { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { hash } from '@node-rs/argon2';
import request from 'supertest';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { AppModule } from '../src/app.module.js';
import { API_PREFIX } from '../src/common/api-prefix.js';
import { PrismaService } from '../src/common/prisma.service.js';

// 供应商与采购关键路径（契约/集成层，技术方案 §10）：
// 供应商期初应付 + 采购应计 − 付款流水 = 应付；现结派生 / 同步 / 软删付款流水。
// 使用独特日期（2030-03-xx），与其他用例隔离；测试结束清理。

describe('供应商与采购（契约/集成）', () => {
  let app: INestApplication;
  let prisma: PrismaService;
  let accessToken: string;
  let supplierId: string;
  let accountId: string;
  let creditOrderId: string;
  let settledOrderId: string;
  const username = `it-purchase-user-${Date.now()}`;
  const password = 'Secret#12345';
  const supplierName = `it-purchase-supplier-${Date.now()}`;
  const accountName = `it-purchase-account-${Date.now()}`;
  const purchaseDate = '2030-03-06';
  const base = {
    supplierId: '',
    purchaseDate,
    deliveredTons: '1.500',
    settledTons: '1.000',
    unitPrice: '100.00',
    otherAmount: '20.00',
    note: '',
  };

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
    const supplier = await request(app.getHttpServer())
      .post(`/${API_PREFIX}/suppliers`)
      .set('Authorization', `Bearer ${accessToken}`)
      .send({ name: supplierName, contact: '13800000000', openingPayable: '1000.00', note: '' });
    supplierId = supplier.body.id as string;
    const account = await request(app.getHttpServer())
      .post(`/${API_PREFIX}/finance/accounts`)
      .set('Authorization', `Bearer ${accessToken}`)
      .send({ name: accountName, kind: 'personal', channel: 'cash', openingBalance: '0.00' });
    accountId = account.body.id as string;
  });

  afterAll(async () => {
    await prisma.client.purchaseOrder.deleteMany({ where: { supplierId } });
    await prisma.client.financeCashEntry.deleteMany({ where: { occurredDate: new Date(`${purchaseDate}T00:00:00Z`) } });
    await prisma.client.financeAccount.deleteMany({ where: { name: accountName } });
    await prisma.client.supplier.deleteMany({ where: { name: { startsWith: 'it-purchase-supplier-' } } });
    await prisma.client.user.deleteMany({ where: { username: { startsWith: 'it-purchase-user-' } } });
    await prisma.client.eventLog.deleteMany({ where: { actorUsername: username } });
    await app.close();
  });

  const http = () => request(app.getHttpServer());
  const auth = (req: request.Test): request.Test => req.set('Authorization', `Bearer ${accessToken}`);

  it('新建供应商：编号自动生成，期初应付可填', async () => {
    const detail = await auth(http().get(`/${API_PREFIX}/suppliers/${supplierId}`));
    expect(detail.status).toBe(200);
    expect(detail.body.code).toMatch(/^SP-\d{5}$/);
    expect(detail.body.openingPayable).toBe('1000.00');
  });

  it('赊购采购单：小计与合计按结算吨数计算', async () => {
    const res = await auth(http().post(`/${API_PREFIX}/purchase-orders`)).send({
      ...base,
      supplierId,
      settlementMode: 'credit',
    });
    expect(res.status).toBe(201);
    expect(res.body).toMatchObject({
      supplierId,
      supplierName,
      deliveredTons: '1.500',
      settledTons: '1.000',
      unitPrice: '100.00',
      subtotalAmount: '100.00',
      otherAmount: '20.00',
      totalAmount: '120.00',
      settlementMode: 'credit',
      paidAmount: null,
    });
    creditOrderId = res.body.id as string;
  });

  it('采购列表：供应商名称模糊命中名称快照', async () => {
    const matched = await auth(http().get(`/${API_PREFIX}/purchase-orders`)).query({
      supplierName: 'purchase-supplier',
      page: 1,
      pageSize: 20,
    });
    expect(matched.status).toBe(200);
    expect(matched.body.total).toBeGreaterThanOrEqual(1);
    expect(
      matched.body.items.some(
        (item: { id: string; supplierName: string }) =>
          item.id === creditOrderId && item.supplierName === supplierName,
      ),
    ).toBe(true);

    const missed = await auth(http().get(`/${API_PREFIX}/purchase-orders`)).query({
      supplierName: 'purchase-supplier-not-exist',
      page: 1,
      pageSize: 20,
    });
    expect(missed.status).toBe(200);
    expect(missed.body.total).toBe(0);
  });

  it('现结采购单：默认实付 = 合计，并派生付款流水', async () => {
    const res = await auth(http().post(`/${API_PREFIX}/purchase-orders`)).send({
      ...base,
      supplierId,
      deliveredTons: '2.000',
      settledTons: '2.000',
      otherAmount: '0.00',
      settlementMode: 'settled',
      settleAccountId: accountId,
    });
    expect(res.status).toBe(201);
    expect(res.body.totalAmount).toBe('200.00');
    expect(res.body.paidAmount).toBe('200.00');
    settledOrderId = res.body.id as string;

    const entries = await auth(http().get(`/${API_PREFIX}/finance/cash-entries`)).query({
      supplierId,
      dateFrom: purchaseDate,
      dateTo: purchaseDate,
      page: 1,
      pageSize: 20,
    });
    expect(entries.status).toBe(200);
    expect(entries.body.items).toHaveLength(1);
    expect(entries.body.items[0]).toMatchObject({
      direction: 'out',
      category: 'purchase_payment',
      amount: '200.00',
      supplierId,
      supplierName,
      sourceType: 'purchase_order',
      sourceId: settledOrderId,
      editable: false,
    });
  });

  it('应付 = 期初应付 + 累计采购 − 累计付款，现结不改变应付', async () => {
    const res = await auth(http().get(`/${API_PREFIX}/finance/payables`)).query({
      supplierIds: supplierId,
    });
    expect(res.status).toBe(200);
    expect(res.body.items[0]).toEqual({
      supplierId,
      openingPayable: '1000.00',
      purchases: '320.00',
      payments: '200.00',
      outstanding: '1120.00',
    });
  });

  it('现结改赊购：付款流水软删，应付回增', async () => {
    const res = await auth(http().put(`/${API_PREFIX}/purchase-orders/${settledOrderId}`)).send({
      ...base,
      supplierId,
      deliveredTons: '2.000',
      settledTons: '2.000',
      otherAmount: '0.00',
      settlementMode: 'credit',
    });
    expect(res.status).toBe(200);
    expect(res.body.settlementMode).toBe('credit');
    expect(res.body.paidAmount).toBeNull();

    const payables = await auth(http().get(`/${API_PREFIX}/finance/payables`)).query({
      supplierIds: supplierId,
    });
    expect(payables.body.items[0]).toMatchObject({
      purchases: '320.00',
      payments: '0.00',
      outstanding: '1320.00',
    });
  });

  it('删除采购单：软删除并回退应付；供应商汇总返回剩余单数', async () => {
    const removed = await auth(http().delete(`/${API_PREFIX}/purchase-orders/${creditOrderId}`));
    expect(removed.status).toBe(204);

    const payables = await auth(http().get(`/${API_PREFIX}/finance/payables`)).query({
      supplierIds: supplierId,
    });
    expect(payables.body.items[0]).toMatchObject({
      purchases: '200.00',
      payments: '0.00',
      outstanding: '1200.00',
    });

    const summary = await auth(http().get(`/${API_PREFIX}/purchase-orders/supplier-summary`)).query({
      supplierIds: supplierId,
    });
    expect(summary.status).toBe(200);
    expect(summary.body.items[0]).toEqual({ supplierId, purchaseCount: 1 });
  });

  it('采购列表：按采购日期 / 合计金额排序', async () => {
    const earlier = await auth(http().post(`/${API_PREFIX}/purchase-orders`)).send({
      ...base,
      supplierId,
      purchaseDate: '2029-01-01',
      deliveredTons: '1.000',
      settledTons: '1.000',
      unitPrice: '50.00',
      otherAmount: '0.00',
      settlementMode: 'credit',
    });
    expect(earlier.status).toBe(201);
    const later = await auth(http().post(`/${API_PREFIX}/purchase-orders`)).send({
      ...base,
      supplierId,
      purchaseDate: '2029-01-02',
      deliveredTons: '1.000',
      settledTons: '1.000',
      unitPrice: '500.00',
      otherAmount: '0.00',
      settlementMode: 'credit',
    });
    expect(later.status).toBe(201);
    const earlierId = earlier.body.id as string;
    const laterId = later.body.id as string;

    try {
      const byDate = await auth(http().get(`/${API_PREFIX}/purchase-orders`)).query({
        supplierId,
        dateFrom: '2029-01-01',
        dateTo: '2029-01-02',
        sortBy: 'purchaseDate',
        sortOrder: 'asc',
        page: 1,
        pageSize: 20,
      });
      expect(byDate.status).toBe(200);
      expect(byDate.body.items.map((item: { id: string }) => item.id)).toEqual([
        earlierId,
        laterId,
      ]);

      const byAmount = await auth(http().get(`/${API_PREFIX}/purchase-orders`)).query({
        supplierId,
        dateFrom: '2029-01-01',
        dateTo: '2029-01-02',
        sortBy: 'totalAmount',
        sortOrder: 'desc',
        page: 1,
        pageSize: 20,
      });
      expect(byAmount.status).toBe(200);
      expect(byAmount.body.items.map((item: { id: string }) => item.id)).toEqual([
        laterId,
        earlierId,
      ]);
    } finally {
      await auth(http().delete(`/${API_PREFIX}/purchase-orders/${earlierId}`));
      await auth(http().delete(`/${API_PREFIX}/purchase-orders/${laterId}`));
    }
  });

  it('批量删除采购单：只删未删行，返回实际删除条数', async () => {
    const first = await auth(http().post(`/${API_PREFIX}/purchase-orders`)).send({
      ...base,
      supplierId,
      purchaseDate: '2028-05-01',
      deliveredTons: '1.000',
      settledTons: '1.000',
      unitPrice: '10.00',
      otherAmount: '0.00',
      settlementMode: 'credit',
    });
    const second = await auth(http().post(`/${API_PREFIX}/purchase-orders`)).send({
      ...base,
      supplierId,
      purchaseDate: '2028-05-02',
      deliveredTons: '1.000',
      settledTons: '1.000',
      unitPrice: '20.00',
      otherAmount: '0.00',
      settlementMode: 'credit',
    });
    expect(first.status).toBe(201);
    expect(second.status).toBe(201);
    const ids = [first.body.id as string, second.body.id as string];

    const res = await auth(http().post(`/${API_PREFIX}/purchase-orders/batch-delete`)).send({ ids });
    expect(res.status).toBe(200);
    expect(res.body).toEqual({ deleted: 2 });

    // 重复提交：已删行静默跳过
    const again = await auth(http().post(`/${API_PREFIX}/purchase-orders/batch-delete`)).send({ ids });
    expect(again.status).toBe(200);
    expect(again.body).toEqual({ deleted: 0 });

    const detail = await auth(http().get(`/${API_PREFIX}/purchase-orders/${ids[0]}`));
    expect(detail.status).toBe(404);
  });

  it('停用供应商后不能新建采购单', async () => {
    const stop = await auth(http().patch(`/${API_PREFIX}/suppliers/${supplierId}/status`)).send({
      status: 'inactive',
    });
    expect(stop.status).toBe(200);

    const blocked = await auth(http().post(`/${API_PREFIX}/purchase-orders`)).send({
      ...base,
      supplierId,
      settlementMode: 'credit',
    });
    expect(blocked.status).toBe(400);

    await auth(http().patch(`/${API_PREFIX}/suppliers/${supplierId}/status`)).send({
      status: 'active',
    });
  });
});
