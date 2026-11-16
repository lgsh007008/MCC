import 'reflect-metadata';
import { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { hash } from '@node-rs/argon2';
import request from 'supertest';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { AppModule } from '../src/app.module.js';
import { API_PREFIX } from '../src/common/api-prefix.js';
import { PrismaService } from '../src/common/prisma.service.js';
import { scopedClient, TEST_TENANT_CODE, TEST_TENANT_ID } from './helpers.js';

// 生产与库存接口关键路径（契约/集成层，技术方案 §10）：
// 原木领用 / 方木产出 / 库存汇总 / 成本快照 / 编辑保存补录 / 盘点 / 负库存 / 权限 / 幂等。
// 使用一次性账号、客户与编号前缀，测试结束清理。

describe('生产与库存接口（契约/集成）', () => {
  let app: INestApplication;
  let prisma: PrismaService;
  let db: PrismaService['client'];
  let token: string;
  let adminToken: string;
  let workerToken: string;
  let financeToken: string;
  let customerId: string;
  const stamp = Date.now();
  const username = `it-production-user-${stamp}`;
  const adminName = `it-production-admin-${stamp}`;
  const workerName = `it-production-worker-${stamp}`;
  const financeName = `it-production-finance-${stamp}`;
  const password = 'Secret#12345';
  const customerName = `it-production-customer-${stamp}`;
  const issueIds: string[] = [];
  const outputIds: string[] = [];
  const batchIds: string[] = [];
  const adjustmentIds: string[] = [];
  let batchId = '';

  const http = () => request(app.getHttpServer());
  const auth = (t: string): { Authorization: string } => ({ Authorization: `Bearer ${t}` });

  async function login(name: string): Promise<string> {
    const res = await http().post(`/${API_PREFIX}/auth/login`).send({
      tenantCode: TEST_TENANT_CODE,
      username: name,
      password,
      rememberMe: false,
    });
    return res.body.accessToken as string;
  }

  async function createIssue(key: string, body: Record<string, unknown>) {
    return http()
      .post(`/${API_PREFIX}/material-issues`)
      .set(auth(token))
      .set('Idempotency-Key', key)
      .send(body);
  }

  async function createOutput(key: string, body: Record<string, unknown>) {
    return http()
      .post(`/${API_PREFIX}/production-outputs`)
      .set(auth(token))
      .set('Idempotency-Key', key)
      .send(body);
  }

  const issueBody = (date = '2099-01-02'): Record<string, unknown> => ({
    issueDate: date,
    tons: '5.000',
    note: '集成测试领用',
    batchId,
  });

  const outputBody = (date = '2099-01-02'): Record<string, unknown> => ({
    outputDate: date,
    note: '集成测试产出',
    batchId,
    outputs: [{ lengthMm: 2500, widthMm: 100, heightMm: 20, pieces: 500, note: '' }],
  });

  // 盘点日期不能晚于今天：按当前日期偏移生成，避免写死未来日期
  const isoDateOffset = (days: number): string => {
    const date = new Date();
    date.setDate(date.getDate() + days);
    const month = String(date.getMonth() + 1).padStart(2, '0');
    const day = String(date.getDate()).padStart(2, '0');
    return `${date.getFullYear()}-${month}-${day}`;
  };

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({ imports: [AppModule] }).compile();
    app = moduleRef.createNestApplication();
    app.setGlobalPrefix(API_PREFIX);
    await app.init();
    prisma = app.get(PrismaService);
    db = scopedClient(prisma.client);
    // 集成测试自持 it-tenant 的库存状态：清掉遗留的期初 / 盘点单，
    // 否则重复设置期初会 409，并连锁影响后续库存断言。
    await db.inventoryAdjustment.deleteMany({});
    await db.user.createMany({
      data: [
        { tenantId: TEST_TENANT_ID, username, passwordHash: await hash(password), role: 'SALES' },
        { tenantId: TEST_TENANT_ID, username: adminName, passwordHash: await hash(password), role: 'ADMIN' },
        { tenantId: TEST_TENANT_ID, username: workerName, passwordHash: await hash(password), role: 'WORKER' },
        { tenantId: TEST_TENANT_ID, username: financeName, passwordHash: await hash(password), role: 'FINANCE' },
      ],
    });
    token = await login(username);
    adminToken = await login(adminName);
    workerToken = await login(workerName);
    financeToken = await login(financeName);
    const batch = await http()
      .post(`/${API_PREFIX}/production-batches`)
      .set(auth(token))
      .set('Idempotency-Key', `it-batch-${stamp}`)
      .send({ batchDate: '2099-01-01', note: '集成测试批次' });
    batchId = batch.body.id as string;
    const customer = await http()
      .post(`/${API_PREFIX}/customers`)
      .set(auth(token))
      .send({ name: customerName, contact: '', note: '' });
    customerId = customer.body.id as string;
  });

  afterAll(async () => {
    const orders = await db.saleOrder.findMany({
      where: { customerId },
      select: { id: true },
    });
    await db.financeCashEntry.deleteMany({
      where: { sourceType: 'sale_order', sourceId: { in: orders.map((row) => row.id) } },
    });
    await db.saleOrder.deleteMany({ where: { customerId } });
    await db.materialIssue.deleteMany({ where: { id: { in: issueIds } } });
    await db.productionOutput.deleteMany({ where: { id: { in: outputIds } } });
    if (batchId) {
      await db.productionBatch.deleteMany({ where: { id: { in: [batchId, ...batchIds] } } });
    }
    await db.inventoryAdjustment.deleteMany({ where: { id: { in: adjustmentIds } } });
    await db.customer.deleteMany({ where: { name: { startsWith: 'it-production-' } } });
    await db.user.deleteMany({
      where: { username: { in: [username, adminName, workerName, financeName] } },
    });
    await db.eventLog.deleteMany({
      where: { actorUsername: { in: [username, adminName, workerName, financeName] } },
    });
    await app.close();
  });

  it('未登录访问原木领用、方木产出与库存 401', async () => {
    expect((await http().get(`/${API_PREFIX}/material-issues`)).status).toBe(401);
    expect((await http().get(`/${API_PREFIX}/production-outputs`)).status).toBe(401);
    expect((await http().get(`/${API_PREFIX}/inventory/summary`)).status).toBe(401);
  });

  it('无期初时创建销售单：成本快照为成本待补', async () => {
    const res = await http()
      .post(`/${API_PREFIX}/sale-orders`)
      .set(auth(token))
      .send({
        saleDate: '2025-12-31',
        customerId,
        otherAmount: '0',
        note: '期初前订单',
        settlementMode: 'credit',
        items: [
          {
            lengthMm: 2500,
            widthMm: 100,
            heightMm: 20,
            pieces: 500,
            pricingMode: 'volume',
            price: '1800.00',
            otherAmount: '0',
            note: '',
          },
        ],
      });
    expect(res.status).toBe(201);
    const profit = await http()
      .get(`/${API_PREFIX}/sale-orders/${res.body.id}/profit`)
      .set(auth(adminToken));
    expect(profit.status).toBe(200);
    expect(profit.body.materialCostStatus).toBe('pending');
    expect(profit.body.materialProfit).toBeNull();
  });

  it('设置期初库存：IC 编号、操作人快照、只读详情；重复设置 409', async () => {
    const res = await http()
      .post(`/${API_PREFIX}/inventory/openings`)
      .set(auth(token))
      .set('Idempotency-Key', `opening-${stamp}`)
      .send({
        openingDate: '2026-01-01',
        note: '集成测试期初',
        rawLog: { quantity: '10.000', amount: '5000.00' },
        timber: [],
      });
    expect(res.status).toBe(201);
    expect(res.body.code).toMatch(/^IC-\d{5}$/);
    adjustmentIds.push(res.body.id);

    const current = await http()
      .get(`/${API_PREFIX}/inventory/openings/current`)
      .set(auth(token));
    expect(current.status).toBe(200);
    expect(current.body).toMatchObject({
      id: res.body.id,
      code: res.body.code,
      openingDate: '2026-01-01',
      operatorName: username,
      note: '集成测试期初',
      totalAmount: '5000.00',
    });
    expect(current.body.items).toEqual([
      expect.objectContaining({
        targetType: 'raw_log',
        bookQuantity: '0.000',
        actualQuantity: '10.000',
        differenceQuantity: '10.000',
        unitCost: '500.000000',
        amount: '5000.00',
        reason: 'opening',
      }),
    ]);

    const second = await http()
      .post(`/${API_PREFIX}/inventory/openings`)
      .set(auth(token))
      .set('Idempotency-Key', `opening-second-${stamp}`)
      .send({
        openingDate: '2026-01-01',
        note: '',
        rawLog: { quantity: '1.000', amount: '500.00' },
        timber: [],
      });
    expect(second.status).toBe(409);
  });

  it('新建原木领用：MI 编号、列表汇总、幂等', async () => {
    const key = `issue-${stamp}`;
    const first = await createIssue(key, issueBody());
    expect(first.status).toBe(201);
    issueIds.push(first.body.id);
    expect(first.body.code).toMatch(/^MI-\d{5}$/);
    expect(first.body.tons).toBe('5.000');

    const second = await createIssue(key, issueBody());
    expect(second.status).toBe(201);
    expect(second.body.id).toBe(first.body.id);

    const list = await http()
      .get(`/${API_PREFIX}/material-issues`)
      .set(auth(token))
      .query({ page: 1, pageSize: 20 });
    expect(list.status).toBe(200);
    expect(list.body.summary.tons).toBe('5.000');
    expect(list.body.items[0]).toMatchObject({ id: first.body.id, code: first.body.code });
  });

  it('库存汇总：领用后待结转 2500 元，库存总值暂降为 2500', async () => {
    const res = await http().get(`/${API_PREFIX}/inventory/summary`).set(auth(token));
    expect(res.status).toBe(200);
    expect(res.body.raw.quantity).toBe('5.000');
    expect(res.body.raw.amount).toBe('2500.00');
    expect(res.body.timber.quantity).toBe('0.0000');
    expect(res.body.timber.amount).toBe('0.00');
    expect(res.body.timber.unitCost).toBe('0.000000');
    expect(res.body.pendingAmount).toBe('2500.00');
    expect(res.body.totalAmount).toBe('2500.00');
  });

  it('新建方木产出：PR 编号、方量落账、幂等', async () => {
    const key = `output-${stamp}`;
    const first = await createOutput(key, outputBody());
    expect(first.status).toBe(201);
    outputIds.push(first.body.id);
    expect(first.body.code).toMatch(/^PR-\d{5}$/);
    expect(first.body.totalVolume).toBe('2.5000');
    expect(first.body.lineCount).toBe(1);

    const second = await createOutput(key, outputBody());
    expect(second.status).toBe(201);
    expect(second.body.id).toBe(first.body.id);

    const list = await http()
      .get(`/${API_PREFIX}/production-outputs`)
      .set(auth(token))
      .query({ page: 1, pageSize: 20 });
    expect(list.status).toBe(200);
    expect(list.body.summary.totalVolume).toBe('2.5000');
  });

  it('库存汇总：领用后原木剩 5 吨；方木 2.5 方 / 2500 元', async () => {
    const res = await http().get(`/${API_PREFIX}/inventory/summary`).set(auth(token));
    expect(res.status).toBe(200);
    expect(res.body.needsOpening).toBe(false);
    expect(res.body.raw.quantity).toBe('5.000');
    expect(res.body.raw.amount).toBe('2500.00');
    expect(res.body.raw.unitCost).toBe('500.000000');
    expect(res.body.timber.quantity).toBe('2.5000');
    expect(res.body.timber.amount).toBe('2500.00');
    expect(res.body.timber.unitCost).toBe('1000.000000');
    expect(res.body.pendingAmount).toBe('0.00');
    expect(res.body.totalAmount).toBe('5000.00');
    expect(res.body.timberLines).toEqual([
      expect.objectContaining({
        lengthMm: 2500,
        widthMm: 100,
        heightMm: 20,
        quantity: '2.5000',
        unitCost: '1000.000000',
        amount: '2500.00',
        negative: false,
      }),
    ]);
  });

  it('编辑保存成本待补订单：补录当前批次成本并锁定', async () => {
    const list = await http()
      .get(`/${API_PREFIX}/sale-orders`)
      .set(auth(token))
      .query({ customerId, page: 1, pageSize: 20 });
    const pending = (list.body.items as Array<{ id: string }>)[0];
    const updated = await http()
      .put(`/${API_PREFIX}/sale-orders/${pending?.id}`)
      .set(auth(token))
      .send({
        saleDate: '2025-12-31',
        customerId,
        otherAmount: '0',
        note: '期初前订单',
        settlementMode: 'credit',
        items: [
          {
            lengthMm: 2500,
            widthMm: 100,
            heightMm: 20,
            pieces: 500,
            pricingMode: 'volume',
            price: '1800.00',
            otherAmount: '0',
            note: '',
          },
        ],
      });
    expect(updated.status).toBe(200);

    const profit = await http()
      .get(`/${API_PREFIX}/sale-orders/${pending?.id}/profit`)
      .set(auth(adminToken));
    expect(profit.status).toBe(200);
    expect(profit.body.materialCostStatus).toBe('final');
    expect(profit.body.materialUnitCost).toBe('1000.000000');
    expect(profit.body.materialCostAmount).toBe('2500.00');
    expect(profit.body.materialProfit).toBe('2000.00');
    expect(profit.body.costLayers).toHaveLength(1);
  });

  it('开单后库存扣减；库存不足仍可开单并产生负库存', async () => {
    const first = await http()
      .post(`/${API_PREFIX}/sale-orders`)
      .set(auth(token))
      .send({
        saleDate: '2099-01-03',
        customerId,
        otherAmount: '0',
        note: '正常出库',
        settlementMode: 'credit',
        items: [
          {
            lengthMm: 2500,
            widthMm: 100,
            heightMm: 20,
            pieces: 500,
            pricingMode: 'volume',
            price: '1800.00',
            otherAmount: '0',
            note: '',
          },
        ],
      });
    expect(first.status).toBe(201);
    const profit = await http()
      .get(`/${API_PREFIX}/sale-orders/${first.body.id}/profit`)
      .set(auth(adminToken));
    expect(profit.body.materialCostStatus).toBe('final');
    expect(profit.body.materialCostAmount).toBe('2500.00');

    let summary = await http().get(`/${API_PREFIX}/inventory/summary`).set(auth(token));
    expect(summary.body.timber.quantity).toBe('0.0000');

    const negative = await http()
      .post(`/${API_PREFIX}/sale-orders`)
      .set(auth(token))
      .send({
        saleDate: '2099-01-04',
        customerId,
        otherAmount: '0',
        note: '负库存出库',
        settlementMode: 'credit',
        items: [
          {
            lengthMm: 2500,
            widthMm: 100,
            heightMm: 20,
            pieces: 200,
            pricingMode: 'volume',
            price: '1800.00',
            otherAmount: '0',
            note: '',
          },
        ],
      });
    expect(negative.status).toBe(201);

    summary = await http().get(`/${API_PREFIX}/inventory/summary`).set(auth(token));
    expect(summary.body.timber.quantity).toBe('-1.0000');
    expect(summary.body.negativeLineCount).toBe(1);
  });

  it('库存盘点（原木）：单类型生成 IC 调整、列表按类型筛选、详情与库存回算', async () => {
    const res = await http()
      .post(`/${API_PREFIX}/inventory/counts`)
      .set(auth(token))
      .set('Idempotency-Key', `count-raw-${stamp}`)
      .send({
        targetType: 'raw_log',
        countDate: '2026-01-05',
        note: '集成测试原木盘点',
        rawLog: { actualQuantity: '6.000' },
      });
    expect(res.status).toBe(201);
    expect(res.body.code).toMatch(/^IC-\d{5}$/);
    adjustmentIds.push(res.body.id);

    const list = await http()
      .get(`/${API_PREFIX}/inventory/counts`)
      .set(auth(token))
      .query({
        dateFrom: '2026-01-05',
        dateTo: '2026-01-05',
        targetType: 'raw_log',
        page: 1,
        pageSize: 20,
      });
    expect(list.status).toBe(200);
    expect(list.body.total).toBe(1);
    expect(list.body.items[0]).toMatchObject({
      id: res.body.id,
      code: res.body.code,
      targetType: 'raw_log',
      adjustmentDate: '2026-01-05',
      operatorName: username,
      gainCount: 1,
      lossCount: 0,
      rawDifferenceTons: '1.000',
      timberDifferenceVolume: '0.0000',
      differenceAmount: '500.00',
    });

    const timberList = await http()
      .get(`/${API_PREFIX}/inventory/counts`)
      .set(auth(token))
      .query({ targetType: 'timber', page: 1, pageSize: 20 });
    expect(timberList.status).toBe(200);
    expect(timberList.body.total).toBe(0);

    const detail = await http()
      .get(`/${API_PREFIX}/inventory/counts/${res.body.id}`)
      .set(auth(token));
    expect(detail.status).toBe(200);
    expect(detail.body).toMatchObject({
      id: res.body.id,
      targetType: 'raw_log',
      operatorName: username,
    });
    expect(detail.body.items).toHaveLength(1);
    expect(detail.body.items[0]).toMatchObject({
      targetType: 'raw_log',
      bookQuantity: '5.000',
      actualQuantity: '6.000',
      differenceQuantity: '1.000',
      amount: '500.00',
      reason: 'other',
    });

    const summary = await http().get(`/${API_PREFIX}/inventory/summary`).set(auth(token));
    expect(summary.body.raw.quantity).toBe('6.000');
    expect(summary.body.timber.quantity).toBe('-1.0000');
  });

  it('库存盘点（方木）：损耗原因落库、负库存归零', async () => {
    const res = await http()
      .post(`/${API_PREFIX}/inventory/counts`)
      .set(auth(token))
      .set('Idempotency-Key', `count-timber-${stamp}`)
      .send({
        targetType: 'timber',
        countDate: '2026-01-06',
        note: '集成测试方木盘点',
        timber: [
          {
            lengthMm: 2500,
            widthMm: 100,
            heightMm: 20,
            actualQuantity: '0.0000',
            reason: 'damage',
          },
        ],
      });
    expect(res.status).toBe(201);
    adjustmentIds.push(res.body.id);

    const detail = await http()
      .get(`/${API_PREFIX}/inventory/counts/${res.body.id}`)
      .set(auth(token));
    expect(detail.status).toBe(200);
    expect(detail.body.targetType).toBe('timber');
    expect(detail.body.items).toHaveLength(1);
    expect(detail.body.items[0]).toMatchObject({
      targetType: 'timber',
      bookQuantity: '-1.0000',
      actualQuantity: '0.0000',
      differenceQuantity: '1.0000',
      amount: '1000.00',
      reason: 'damage',
    });

    const summary = await http().get(`/${API_PREFIX}/inventory/summary`).set(auth(token));
    expect(summary.body.timber.quantity).toBe('0.0000');
    expect(summary.body.negativeLineCount).toBe(0);
  });

  it('盘点校验：晚于今天 / 早于期初 / 实盘全空', async () => {
    const future = await http()
      .post(`/${API_PREFIX}/inventory/counts`)
      .set(auth(token))
      .set('Idempotency-Key', `count-future-${stamp}`)
      .send({
        targetType: 'raw_log',
        countDate: isoDateOffset(1),
        note: '',
        rawLog: { actualQuantity: '6.000' },
      });
    expect(future.status).toBe(400);
    expect(future.body.code).toBe('COUNT_IN_FUTURE');

    const beforeOpening = await http()
      .post(`/${API_PREFIX}/inventory/counts`)
      .set(auth(token))
      .set('Idempotency-Key', `count-before-${stamp}`)
      .send({
        targetType: 'raw_log',
        countDate: '2025-12-31',
        note: '',
        rawLog: { actualQuantity: '6.000' },
      });
    expect(beforeOpening.status).toBe(400);
    expect(beforeOpening.body.code).toBe('COUNT_BEFORE_OPENING');

    const empty = await http()
      .post(`/${API_PREFIX}/inventory/counts`)
      .set(auth(token))
      .set('Idempotency-Key', `count-empty-${stamp}`)
      .send({
        targetType: 'raw_log',
        countDate: '2026-01-07',
        note: '',
        rawLog: {},
      });
    expect(empty.status).toBe(400);
    expect(empty.body.code).toBe('COUNT_NO_LINES');
  });

  it('生产批次：关闭时结清剩余待结转，并锁定领用与产出', async () => {
    const batch = await http()
      .post(`/${API_PREFIX}/production-batches`)
      .set(auth(token))
      .set('Idempotency-Key', `it-batch-close-${stamp}`)
      .send({ batchDate: '2099-02-01', note: '关闭测试批次' });
    expect(batch.status).toBe(201);
    const closeBatchId = batch.body.id as string;
    batchIds.push(closeBatchId);

    const firstIssue = await createIssue(`it-close-issue-1-${stamp}`, {
      issueDate: '2099-02-02',
      tons: '2.000',
      note: '',
      batchId: closeBatchId,
    });
    expect(firstIssue.status).toBe(201);
    issueIds.push(firstIssue.body.id);

    const output = await createOutput(`it-close-output-${stamp}`, {
      outputDate: '2099-02-02',
      note: '',
      batchId: closeBatchId,
      outputs: [{ lengthMm: 2500, widthMm: 100, heightMm: 20, pieces: 200, note: '' }],
    });
    expect(output.status).toBe(201);
    outputIds.push(output.body.id);

    const secondIssue = await createIssue(`it-close-issue-2-${stamp}`, {
      issueDate: '2099-02-03',
      tons: '2.000',
      note: '',
      batchId: closeBatchId,
    });
    expect(secondIssue.status).toBe(201);
    issueIds.push(secondIssue.body.id);

    const closed = await http()
      .post(`/${API_PREFIX}/production-batches/${closeBatchId}/close`)
      .set(auth(token));
    expect(closed.status).toBe(200);
    expect(closed.body.status).toBe('closed');
    expect(closed.body.pendingAmount).toBe('0.00');
    expect(closed.body.closedSettledAmount).toBe('1000.00');
    expect(closed.body.timberVolume).toBe('1.0000');
    expect(closed.body.timberAmount).toBe('2000.00');

    const list = await http()
      .get(`/${API_PREFIX}/production-batches`)
      .set(auth(token))
      .query({ status: 'closed', page: 1, pageSize: 100 });
    expect(list.status).toBe(200);
    expect(list.body.items.map((item: { code: string }) => item.code)).toContain(batch.body.code);

    const createLocked = await createIssue(`it-close-issue-3-${stamp}`, {
      issueDate: '2099-02-04',
      tons: '1.000',
      note: '',
      batchId: closeBatchId,
    });
    expect(createLocked.status).toBe(409);
    expect(createLocked.body.code).toBe('BATCH_CLOSED');

    const updateLocked = await http()
      .put(`/${API_PREFIX}/material-issues/${secondIssue.body.id}`)
      .set(auth(token))
      .send({ issueDate: '2099-02-04', tons: '1.000', note: '', batchId: closeBatchId });
    expect(updateLocked.status).toBe(409);
    expect(updateLocked.body.code).toBe('BATCH_CLOSED');

    const deleteLocked = await http()
      .delete(`/${API_PREFIX}/material-issues/${secondIssue.body.id}`)
      .set(auth(token));
    expect(deleteLocked.status).toBe(409);
    expect(deleteLocked.body.code).toBe('BATCH_CLOSED');
  });

  it('生产批次批量关闭：跳过已关闭；任一批次待结转无库存则整批拒绝', async () => {
    async function makeBatch(key: string, withOutput: boolean): Promise<string> {
      const batch = await http()
        .post(`/${API_PREFIX}/production-batches`)
        .set(auth(token))
        .set('Idempotency-Key', `it-batch-${key}-${stamp}`)
        .send({ batchDate: '2099-03-01', note: `批量关闭测试 ${key}` });
      expect(batch.status).toBe(201);
      const id = batch.body.id as string;
      batchIds.push(id);
      const issue = await createIssue(`it-batch-${key}-issue-${stamp}`, {
        issueDate: '2099-03-02',
        tons: '2.000',
        note: '',
        batchId: id,
      });
      expect(issue.status).toBe(201);
      issueIds.push(issue.body.id);
      if (withOutput) {
        const output = await createOutput(`it-batch-${key}-output-${stamp}`, {
          outputDate: '2099-03-02',
          note: '',
          batchId: id,
          outputs: [{ lengthMm: 2500, widthMm: 100, heightMm: 20, pieces: 200, note: '' }],
        });
        expect(output.status).toBe(201);
        outputIds.push(output.body.id);
      }
      return id;
    }

    const openId = await makeBatch('open', true);
    const closedId = await makeBatch('closed', true);
    const closed = await http()
      .post(`/${API_PREFIX}/production-batches/${closedId}/close`)
      .set(auth(token));
    expect(closed.status).toBe(200);

    const result = await http()
      .post(`/${API_PREFIX}/production-batches/batch-close`)
      .set(auth(token))
      .send({ ids: [openId, closedId] });
    expect(result.status).toBe(200);
    expect(result.body).toEqual({ closed: 1, skipped: 1 });
    expect((await db.productionBatch.findUnique({ where: { id: openId } }))?.status).toBe('CLOSED');

    const blockedId = await makeBatch('blocked', false);
    const validId = await makeBatch('valid', true);
    const rejected = await http()
      .post(`/${API_PREFIX}/production-batches/batch-close`)
      .set(auth(token))
      .send({ ids: [blockedId, validId] });
    expect(rejected.status).toBe(409);
    expect(rejected.body.code).toBe('BATCH_PENDING_NO_STOCK');
    expect((await db.productionBatch.findUnique({ where: { id: validId } }))?.status).toBe('OPEN');
  });

  it('权限：工人无领用 / 产出 / 库存权限；财务可看库存、盘点与两张单据但不能新建；材料毛利仅管理员', async () => {
    expect((await http().get(`/${API_PREFIX}/material-issues`).set(auth(workerToken))).status).toBe(403);
    expect((await http().get(`/${API_PREFIX}/production-outputs`).set(auth(workerToken))).status).toBe(403);
    expect((await http().get(`/${API_PREFIX}/inventory/summary`).set(auth(workerToken))).status).toBe(403);
    expect(
      (await http().get(`/${API_PREFIX}/inventory/openings/current`).set(auth(workerToken))).status,
    ).toBe(403);
    expect(
      (await http().get(`/${API_PREFIX}/inventory/counts`).set(auth(workerToken))).status,
    ).toBe(403);
    const orders = await http()
      .get(`/${API_PREFIX}/sale-orders`)
      .set(auth(token))
      .query({ customerId, page: 1, pageSize: 20 });
    const first = (orders.body.items as Array<{ id: string }>)[0];
    expect(
      (await http().get(`/${API_PREFIX}/sale-orders/${first?.id}/profit`).set(auth(workerToken))).status,
    ).toBe(403);
    // 材料毛利仅管理员可见：销售 / 财务同样 403
    expect(
      (await http().get(`/${API_PREFIX}/sale-orders/${first?.id}/profit`).set(auth(token))).status,
    ).toBe(403);
    expect(
      (await http().get(`/${API_PREFIX}/sale-orders/${first?.id}/profit`).set(auth(financeToken))).status,
    ).toBe(403);
    expect(
      (await http().get(`/${API_PREFIX}/sale-orders/${first?.id}/profit`).set(auth(adminToken))).status,
    ).toBe(200);

    expect((await http().get(`/${API_PREFIX}/inventory/summary`).set(auth(financeToken))).status).toBe(200);
    expect(
      (await http().get(`/${API_PREFIX}/inventory/openings/current`).set(auth(financeToken))).status,
    ).toBe(200);
    expect(
      (await http().get(`/${API_PREFIX}/inventory/counts`).set(auth(financeToken))).status,
    ).toBe(200);
    expect(
      (await http().get(`/${API_PREFIX}/material-issues`).set(auth(financeToken))).status,
    ).toBe(200);
    expect(
      (await http().get(`/${API_PREFIX}/production-outputs`).set(auth(financeToken))).status,
    ).toBe(200);
    expect(
      (
        await http()
          .post(`/${API_PREFIX}/inventory/counts`)
          .set(auth(financeToken))
          .send({
            targetType: 'raw_log',
            countDate: '2026-01-08',
            note: '',
            rawLog: { actualQuantity: '6.000' },
          })
      ).status,
    ).toBe(403);
    expect(
      (
        await http()
          .post(`/${API_PREFIX}/material-issues`)
          .set(auth(financeToken))
          .send(issueBody('2099-01-07'))
      ).status,
    ).toBe(403);
    expect(
      (
        await http()
          .post(`/${API_PREFIX}/production-outputs`)
          .set(auth(financeToken))
          .send(outputBody('2099-01-07'))
      ).status,
    ).toBe(403);
  });
});
