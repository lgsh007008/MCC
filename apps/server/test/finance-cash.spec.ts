import 'reflect-metadata';
import { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { hash } from '@node-rs/argon2';
import request from 'supertest';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { AppModule } from '../src/app.module.js';
import { API_PREFIX } from '../src/common/api-prefix.js';
import { PrismaService } from '../src/common/prisma.service.js';

// 资金收付 / 应收关键路径（product/finance.md R-财务-002）：
// 账户余额、内部转账不计收支、收款减少欠款、编号前缀。
// 使用独特日期（2030-02-xx）与随机名称，测试结束清理。

describe('资金收付（契约/集成）', () => {
  let app: INestApplication;
  let prisma: PrismaService;
  let accessToken: string;
  const username = `it-cash-user-${Date.now()}`;
  const password = 'Secret#12345';
  const customerName = `it-cash-customer-${Date.now()}`;
  const date = '2030-02-05';
  let customerId: string;
  let corporateId: string;
  let personalId: string;
  let receiptId: string;

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
    const accounts = await prisma.client.financeAccount.findMany({
      where: { name: { startsWith: 'it-cash-' } },
      select: { id: true },
    });
    const accountIds = accounts.map((row) => row.id);
    await prisma.client.financeCashEntry.deleteMany({
      where: { OR: [{ accountId: { in: accountIds } }, { toAccountId: { in: accountIds } }] },
    });
    await prisma.client.saleOrder.deleteMany({ where: { customerId } });
    await prisma.client.financeAccount.deleteMany({ where: { id: { in: accountIds } } });
    await prisma.client.customer.deleteMany({ where: { name: { startsWith: 'it-cash-' } } });
    await prisma.client.user.deleteMany({ where: { username: { startsWith: 'it-cash-user-' } } });
    await prisma.client.eventLog.deleteMany({ where: { actorUsername: username } });
    await app.close();
  });

  const http = () => request(app.getHttpServer());
  const auth = (req: request.Test): request.Test => req.set('Authorization', `Bearer ${accessToken}`);

  it('新建资金账户：编号 AC-#####，余额等于期初', async () => {
    const corporate = await auth(http().post(`/${API_PREFIX}/finance/accounts`)).send({
      name: `it-cash-corporate-${Date.now()}`,
      kind: 'corporate',
      channel: 'bank',
      openingBalance: '1000.00',
      active: true,
    });
    expect(corporate.status).toBe(201);
    expect(String(corporate.body.code)).toMatch(/^AC-\d{5}$/);
    expect(corporate.body.balance).toBe('1000.00');
    corporateId = corporate.body.id as string;

    const personal = await auth(http().post(`/${API_PREFIX}/finance/accounts`)).send({
      name: `it-cash-personal-${Date.now()}`,
      kind: 'personal',
      channel: 'wechat',
      openingBalance: '0.00',
      active: true,
    });
    expect(personal.status).toBe(201);
    personalId = personal.body.id as string;
  });

  it('收款挂客户：编号 CF-#####，账户余额增加', async () => {
    const res = await auth(http().post(`/${API_PREFIX}/finance/cash-entries`)).send({
      direction: 'in',
      occurredDate: date,
      amount: '200.00',
      accountId: corporateId,
      category: 'sales_receipt',
      customerId,
      note: '收货款',
    });
    expect(res.status).toBe(201);
    expect(String(res.body.code)).toMatch(/^CF-\d{5}$/);
    expect(res.body.customerName).toBe(customerName);
    receiptId = res.body.id as string;

    const accounts = await auth(http().get(`/${API_PREFIX}/finance/accounts`));
    const corporate = accounts.body.items.find((row: { id: string }) => row.id === corporateId);
    expect(corporate.balance).toBe('1200.00');
  });

  it('付款与内部转账：转账不计收支，两账户余额此消彼长', async () => {
    const payment = await auth(http().post(`/${API_PREFIX}/finance/cash-entries`)).send({
      direction: 'out',
      occurredDate: date,
      amount: '50.00',
      accountId: corporateId,
      category: 'operating_expense',
      note: '电费',
    });
    expect(payment.status).toBe(201);

    const transfer = await auth(http().post(`/${API_PREFIX}/finance/cash-entries`)).send({
      direction: 'transfer',
      occurredDate: date,
      amount: '300.00',
      accountId: corporateId,
      toAccountId: personalId,
      note: '对公转个人',
    });
    expect(transfer.status).toBe(201);

    const summary = await auth(http().get(`/${API_PREFIX}/finance/cash-summary`)).query({
      dateFrom: date,
      dateTo: date,
    });
    expect(summary.status).toBe(200);
    expect(summary.body).toMatchObject({
      receipts: '200.00',
      payments: '50.00',
      netFlow: '150.00',
    });
    const corporate = summary.body.accounts.find(
      (row: { id: string }) => row.id === corporateId,
    );
    const personal = summary.body.accounts.find((row: { id: string }) => row.id === personalId);
    expect(corporate.balance).toBe('850.00');
    expect(personal.balance).toBe('300.00');
  });

  it('应收：累计销售与累计收款，欠款为负时即预收', async () => {
    const res = await auth(http().get(`/${API_PREFIX}/finance/receivables`)).query({
      customerIds: customerId,
    });
    expect(res.status).toBe(200);
    expect(res.body.items[0]).toMatchObject({
      customerId,
      sales: '0.00',
      receipts: '200.00',
      outstanding: '-200.00',
    });
  });

  it('流水列表：合计行只算收款与付款', async () => {
    const res = await auth(http().get(`/${API_PREFIX}/finance/cash-entries`)).query({
      dateFrom: date,
      dateTo: date,
      pageSize: 100,
    });
    expect(res.status).toBe(200);
    expect(res.body.total).toBe(3);
    expect(res.body.summary).toEqual({
      receipts: '200.00',
      payments: '50.00',
      net: '150.00',
    });
  });

  it('删除收款：余额回退，欠款归零', async () => {
    const removed = await auth(http().delete(`/${API_PREFIX}/finance/cash-entries/${receiptId}`));
    expect(removed.status).toBe(204);
    const res = await auth(http().get(`/${API_PREFIX}/finance/receivables`)).query({
      customerIds: customerId,
    });
    expect(res.body.items[0].receipts).toBe('0.00');
    expect(res.body.items[0].outstanding).toBe('0.00');
  });

  it('销售单现结：收入按实收、收款流水自动生成、应收结清、改赊销后流水回退', async () => {
    const created = await auth(http().post(`/${API_PREFIX}/sale-orders`)).send({
      saleDate: date,
      customerId,
      otherAmount: '0',
      note: '现结集成测试',
      settlementMode: 'settled',
      settleAccountId: corporateId,
      receivedAmount: '98.00',
      items: [
        {
          lengthMm: 1000,
          widthMm: 100,
          heightMm: 20,
          pieces: 5,
          pricingMode: 'volume',
          price: '10000.00',
          otherAmount: '0',
          note: '',
        },
      ],
    });
    expect(created.status).toBe(201);
    expect(created.body).toMatchObject({
      settlementMode: 'settled',
      receivedAmount: '98.00',
      totalAmount: '100.00',
    });

    const receivables = await auth(http().get(`/${API_PREFIX}/finance/receivables`)).query({
      customerIds: customerId,
    });
    expect(receivables.body.items[0]).toMatchObject({
      sales: '98.00',
      receipts: '98.00',
      outstanding: '0.00',
    });

    const entries = await auth(http().get(`/${API_PREFIX}/finance/cash-entries`)).query({
      pageSize: 100,
    });
    const sourceEntry = entries.body.items.find(
      (item: { sourceType: string | null; sourceId: string | null }) =>
        item.sourceType === 'sale_order' && item.sourceId === created.body.id,
    );
    expect(sourceEntry).toMatchObject({
      direction: 'in',
      category: 'sales_receipt',
      amount: '98.00',
      editable: false,
    });

    // 改为赊销：收款流水软删，应收恢复为合计
    const updated = await auth(http().put(`/${API_PREFIX}/sale-orders/${created.body.id}`)).send({
      saleDate: date,
      customerId,
      otherAmount: '0',
      note: '改为赊销',
      settlementMode: 'credit',
      items: created.body.items.map((item: { id: string }) => ({
        id: item.id,
        lengthMm: 1000,
        widthMm: 100,
        heightMm: 20,
        pieces: 5,
        pricingMode: 'volume',
        price: '10000.00',
        otherAmount: '0',
        note: '',
      })),
    });
    expect(updated.status).toBe(200);
    const after = await auth(http().get(`/${API_PREFIX}/finance/receivables`)).query({
      customerIds: customerId,
    });
    expect(after.body.items[0]).toMatchObject({
      sales: '100.00',
      receipts: '0.00',
      outstanding: '100.00',
    });

    const removed = await auth(http().delete(`/${API_PREFIX}/sale-orders/${created.body.id}`));
    expect(removed.status).toBe(204);
  });
});
