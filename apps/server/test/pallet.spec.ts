import 'reflect-metadata';
import { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { hash } from '@node-rs/argon2';
import request from 'supertest';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type { PalletProjectInput } from '@mcc/shared';
import { AppModule } from '../src/app.module.js';
import { API_PREFIX } from '../src/common/api-prefix.js';
import { PrismaService } from '../src/common/prisma.service.js';
import { scopedClient, TEST_TENANT_CODE, TEST_TENANT_ID } from './helpers.js';

// 托盘设计接口关键路径（契约/集成层，技术方案 §10）：
// 守卫 401 / 新建（PD 编号、合计重算）/ 列表 / 详情 / 更新 / 复制 / 软删除。
// 使用一次性测试账号与项目名前缀，测试结束清理。

const projectName = `it-pallet-${Date.now()}`;

const body = (): PalletProjectInput => ({
  name: projectName,
  customerName: '集成测试客户',
  templateType: 'block',
  destination: 'export',
  entryDirection: '4',
  lengthMm: 1200,
  widthMm: 800,
  targetLoadKg: 500,
  loadType: 'uniform',
  note: '集成测试',
  components: [
    {
      role: 'topDeck',
      name: '面板',
      materialCode: 'pine',
      orientation: 'x',
      lengthMm: 1200,
      widthMm: 90,
      heightMm: 20,
      quantity: 5,
      wastePct: 0.08,
      processCost: 1.5,
      priceOverride: 0,
    },
    {
      role: 'stringerBoard',
      name: '中间纵梁板',
      materialCode: 'pine',
      orientation: 'y',
      lengthMm: 800,
      widthMm: 90,
      heightMm: 20,
      quantity: 3,
      wastePct: 0.08,
      processCost: 1.2,
      priceOverride: 0,
    },
    {
      role: 'block',
      name: '墩块',
      materialCode: 'pine',
      orientation: 'x',
      lengthMm: 90,
      widthMm: 90,
      heightMm: 70,
      quantity: 9,
      wastePct: 0.1,
      processCost: 0.8,
      priceOverride: 0,
    },
    {
      role: 'bottomDeck',
      name: '底板',
      materialCode: 'pine',
      orientation: 'x',
      lengthMm: 1200,
      widthMm: 90,
      heightMm: 20,
      quantity: 3,
      wastePct: 0.08,
      processCost: 1.2,
      priceOverride: 0,
    },
  ],
});

describe('托盘设计接口（契约/集成）', () => {
  let app: INestApplication;
  let prisma: PrismaService;
  let db: PrismaService['client'];
  let accessToken: string;
  const username = `it-pallet-user-${Date.now()}`;
  const password = 'Secret#12345';
  let projectId: string;

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({ imports: [AppModule] }).compile();
    app = moduleRef.createNestApplication();
    app.setGlobalPrefix(API_PREFIX);
    await app.init();
    prisma = app.get(PrismaService);
    db = scopedClient(prisma.client);
    await db.user.create({
      data: { tenantId: TEST_TENANT_ID, username, passwordHash: await hash(password), role: 'SALES' },
    });
    const login = await request(app.getHttpServer()).post(`/${API_PREFIX}/auth/login`).send({
      tenantCode: TEST_TENANT_CODE,
      username,
      password,
      rememberMe: false,
    });
    accessToken = login.body.accessToken as string;
  });

  afterAll(async () => {
    await db.palletProject.deleteMany({ where: { name: { startsWith: 'it-pallet-' } } });
    await db.user.deleteMany({ where: { username: { startsWith: 'it-pallet-user-' } } });
    await db.eventLog.deleteMany({ where: { actorUsername: username } });
    await app.close();
  });

  const http = () => request(app.getHttpServer());
  const auth = (req: request.Test): request.Test => req.set('Authorization', `Bearer ${accessToken}`);

  it('未登录访问一律 401', async () => {
    const res = await http().get(`/${API_PREFIX}/pallet/projects`);
    expect(res.status).toBe(401);
  });

  it('材料目录只读返回预置材料', async () => {
    const res = await auth(http().get(`/${API_PREFIX}/pallet/materials`));
    expect(res.status).toBe(200);
    expect(res.body.length).toBeGreaterThanOrEqual(11);
    expect(res.body[0].code).toBe('pine');
  });

  it('新建：PD 编号，服务端重算总高与体积', async () => {
    const res = await auth(http().post(`/${API_PREFIX}/pallet/projects`)).send(body());
    expect(res.status).toBe(201);
    expect(String(res.body.code)).toMatch(/^PD-\d{5}$/);
    expect(res.body.totalHeightMm).toBe(130);
    expect(Number(res.body.totalVolumeM3)).toBeCloseTo(0.0267, 4);
    expect(res.body.components).toHaveLength(4);
    projectId = res.body.id as string;
  });

  it('列表与详情返回项目与构件', async () => {
    const list = await auth(http().get(`/${API_PREFIX}/pallet/projects`)).query({
      keyword: projectName,
      page: 1,
      pageSize: 20,
    });
    expect(list.status).toBe(200);
    expect(list.body.total).toBe(1);

    const detail = await auth(http().get(`/${API_PREFIX}/pallet/projects/${projectId}`));
    expect(detail.status).toBe(200);
    expect(detail.body.code).toBe(list.body.items[0].code);
    expect(detail.body.components[0].seq).toBe(1);
  });

  it('更新：整单替换构件并重算', async () => {
    const updated: PalletProjectInput = {
      ...body(),
      note: '更新后的备注',
      components: body().components.map((component) =>
        component.role === 'topDeck' ? { ...component, quantity: 6 } : component,
      ),
    };
    const res = await auth(http().put(`/${API_PREFIX}/pallet/projects/${projectId}`)).send(updated);
    expect(res.status).toBe(200);
    expect(res.body.note).toBe('更新后的备注');
    expect(res.body.components.find((item: { role: string }) => item.role === 'topDeck').quantity).toBe(6);
  });

  it('复制：生成新编号', async () => {
    const res = await auth(http().post(`/${API_PREFIX}/pallet/projects/${projectId}/duplicate`));
    expect(res.status).toBe(201);
    expect(res.body.id).not.toBe(projectId);
    expect(res.body.name).toContain('副本');
    await db.palletProject.deleteMany({ where: { id: res.body.id } });
  });

  it('删除：软删除后详情 404，编号不回收', async () => {
    const removed = await auth(http().delete(`/${API_PREFIX}/pallet/projects/${projectId}`));
    expect(removed.status).toBe(204);
    const detail = await auth(http().get(`/${API_PREFIX}/pallet/projects/${projectId}`));
    expect(detail.status).toBe(404);
    const row = await db.palletProject.findFirst({ where: { id: projectId } });
    expect(row?.deletedAt).not.toBeNull();
  });
});
