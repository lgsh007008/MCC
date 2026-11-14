import 'reflect-metadata';
import { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { hash } from '@node-rs/argon2';
import request from 'supertest';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { AppModule } from '../src/app.module.js';
import { API_PREFIX } from '../src/common/api-prefix.js';
import { PrismaService } from '../src/common/prisma.service.js';

// 财务接口关键路径（契约/集成层，技术方案 §10）：
// 经营收支汇总取「销售单 + 采购单 + 计入经营的流水分类」，销售回款与采购付款不重复计入。
// 使用独特日期（2030-02-xx），与其他用例隔离；测试结束清理。

describe('财务经营收支汇总（契约/集成）', () => {
  let app: INestApplication;
  let prisma: PrismaService;
  let accessToken: string;
  let customerId: string;
  let supplierId: string;
  let accountId: string;
  const username = `it-finance-user-${Date.now()}`;
  const password = 'Secret#12345';
  const customerName = `it-finance-customer-${Date.now()}`;
  const supplierName = `it-finance-supplier-${Date.now()}`;
  const accountName = `it-finance-account-${Date.now()}`;
  const summaryDate = '2030-02-05';

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
    const account = await request(app.getHttpServer())
      .post(`/${API_PREFIX}/finance/accounts`)
      .set('Authorization', `Bearer ${accessToken}`)
      .send({ name: accountName, kind: 'personal', channel: 'cash', openingBalance: '0.00' });
    accountId = account.body.id as string;
    const supplier = await request(app.getHttpServer())
      .post(`/${API_PREFIX}/suppliers`)
      .set('Authorization', `Bearer ${accessToken}`)
      .send({ name: supplierName, contact: '', note: '' });
    supplierId = supplier.body.id as string;
  });

  afterAll(async () => {
    await prisma.client.financeCashEntry.deleteMany({
      where: { occurredDate: new Date(`${summaryDate}T00:00:00Z`) },
    });
    await prisma.client.purchaseOrder.deleteMany({ where: { supplierId } });
    await prisma.client.financeAccount.deleteMany({ where: { name: accountName } });
    await prisma.client.supplier.deleteMany({
      where: { name: { startsWith: 'it-finance-supplier-' } },
    });
    await prisma.client.customer.deleteMany({ where: { name: { startsWith: 'it-finance-' } } });
    await prisma.client.user.deleteMany({ where: { username: { startsWith: 'it-finance-user-' } } });
    await prisma.client.eventLog.deleteMany({ where: { actorUsername: username } });
    await app.close();
  });

  const http = () => request(app.getHttpServer());
  const auth = (req: request.Test): request.Test => req.set('Authorization', `Bearer ${accessToken}`);

  const createEntry = (body: Record<string, unknown>): request.Test =>
    auth(http().post(`/${API_PREFIX}/finance/cash-entries`)).send({
      occurredDate: summaryDate,
      amount: '100.00',
      accountId,
      note: '',
      ...body,
    });

  it('汇总只计入销售 / 采购应计与其他收入 / 工资 / 费用，收付款不重复计入', async () => {
    const purchase = await auth(http().post(`/${API_PREFIX}/purchase-orders`)).send({
      supplierId,
      purchaseDate: summaryDate,
      deliveredTons: '1.000',
      settledTons: '1.000',
      unitPrice: '600.00',
      otherAmount: '0.00',
      settlementMode: 'credit',
      note: '',
    });
    expect(purchase.status).toBe(201);

    const entries = [
      { direction: 'in', category: 'other_revenue', amount: '200.50' },
      { direction: 'out', category: 'purchase_payment', amount: '300.00', supplierId },
      { direction: 'out', category: 'labor_cost', amount: '400.00' },
      { direction: 'out', category: 'operating_expense', amount: '150.25' },
      { direction: 'in', category: 'loan_in', amount: '1000.00' },
      { direction: 'out', category: 'loan_repay', amount: '200.00' },
      { direction: 'out', category: 'asset_purchase', amount: '5000.00' },
    ];
    for (const entry of entries) {
      const res = await createEntry(entry);
      expect(res.status).toBe(201);
    }

    const summary = await auth(http().get(`/${API_PREFIX}/finance/summary`)).query({
      dateFrom: summaryDate,
      dateTo: summaryDate,
    });
    expect(summary.status).toBe(200);
    expect(summary.body).toMatchObject({
      totalIncome: '200.50',
      totalExpense: '1150.25',
      netAmount: '-949.75',
      orderCount: 0,
      purchaseCount: 1,
      cashEntryCount: 3,
    });
    expect(summary.body.categories).toEqual([
      { category: 'sales_revenue', amount: '0.00' },
      { category: 'other_revenue', amount: '200.50' },
      { category: 'purchase_expense', amount: '600.00' },
      { category: 'labor_cost', amount: '400.00' },
      { category: 'operating_expense', amount: '150.25' },
    ]);
  });

  it('采购付款必须挂供应商', async () => {
    const missingSupplier = await createEntry({
      direction: 'out',
      category: 'purchase_payment',
      amount: '50.00',
    });
    expect(missingSupplier.status).toBe(400);

    const valid = await createEntry({
      direction: 'out',
      category: 'purchase_payment',
      amount: '50.00',
      supplierId,
    });
    expect(valid.status).toBe(201);
    expect(valid.body.supplierId).toBe(supplierId);
    expect(valid.body.supplierName).toBe(supplierName);
  });

  it('销售回款必须挂客户，其他收入不可挂客户', async () => {
    const missingCustomer = await createEntry({
      direction: 'in',
      category: 'sales_receipt',
      amount: '100.00',
    });
    expect(missingCustomer.status).toBe(400);

    const wrongCustomer = await createEntry({
      direction: 'in',
      category: 'other_revenue',
      amount: '100.00',
      customerId,
    });
    expect(wrongCustomer.status).toBe(400);

    const valid = await createEntry({
      direction: 'in',
      category: 'sales_receipt',
      amount: '100.00',
      customerId,
    });
    expect(valid.status).toBe(201);
    expect(valid.body.category).toBe('sales_receipt');
    expect(valid.body.customerId).toBe(customerId);
    expect(valid.body.sourceType).toBeNull();
    expect(valid.body.editable).toBe(true);
  });

  it('列表支持按收支分类筛选', async () => {
    const res = await auth(http().get(`/${API_PREFIX}/finance/cash-entries`)).query({
      category: 'operating_expense',
      dateFrom: summaryDate,
      dateTo: summaryDate,
      page: 1,
      pageSize: 20,
    });
    expect(res.status).toBe(200);
    expect(Number(res.body.total)).toBe(1);
    expect(res.body.items[0]).toMatchObject({
      category: 'operating_expense',
      direction: 'out',
      amount: '150.25',
    });
  });
});
