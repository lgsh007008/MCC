import 'reflect-metadata';
import { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { hash } from '@node-rs/argon2';
import request from 'supertest';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type { PackagingProjectInput } from '@mcc/shared';
import {
  deriveCrateOuter,
  deriveCrateParts,
  deriveDividerOuter,
  deriveDividerParts,
  deriveDunnageOuter,
  deriveDunnageParts,
  deriveFrameOuter,
  deriveFrameParts,
} from '@mcc/shared';
import { AppModule } from '../src/app.module.js';
import { API_PREFIX } from '../src/common/api-prefix.js';
import { PrismaService } from '../src/common/prisma.service.js';
import { TenantService } from '../src/modules/tenant/tenant.service.js';
import { scopedClient, TEST_TENANT_CODE, TEST_TENANT_ID } from './helpers.js';

// 包装设计接口关键路径（契约/集成层，技术方案 §10）：
// 守卫 401 / 新建（PD 编号、合计重算）/ 列表 / 详情 / 更新 / 复制 / 发布 / 版本 / 软删除。
// 使用一次性测试账号与方案名前缀，测试结束清理。

const projectName = `it-packaging-${Date.now()}`;

const body = (): PackagingProjectInput => ({
  name: projectName,
  customerName: '集成测试客户',
  destination: 'export',
  note: '集成测试',
  units: [
    {
      unitType: 'PALLET',
      templateCode: 'block',
      name: '1200×800 托盘',
      lengthMm: 1200,
      widthMm: 800,
      targetLoadKg: 500,
      loadType: 'uniform',
      params: {
        entryDirection: '4',
        deck: {
          top: { mode: 'manual', count: 5 },
          bottom: { mode: 'auto', count: null },
        },
      },
      parts: [
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
    },
  ],
});

const crateParams = {
  innerLengthMm: 1200,
  innerWidthMm: 800,
  innerHeightMm: 900,
  thicknessMm: 15,
  bottomThicknessMm: 15,
  baseHeightMm: 90,
  frameThicknessMm: 90,
};
const crateOuter = deriveCrateOuter(crateParams);

const crateBody = (): PackagingProjectInput => ({
  name: `${projectName}-crate`,
  customerName: '集成测试客户',
  destination: 'export',
  note: '木箱集成测试',
  units: [
    {
      unitType: 'CRATE',
      templateCode: 'crate-g',
      name: '普通木箱 G 型',
      lengthMm: crateOuter.lengthMm,
      widthMm: crateOuter.widthMm,
      targetLoadKg: 300,
      loadType: 'uniform',
      params: crateParams,
      parts: deriveCrateParts(crateParams),
    },
  ],
});

const skidBody = (): PackagingProjectInput => ({
  name: `${projectName}-skid`,
  customerName: '集成测试客户',
  destination: 'export',
  note: '滑木箱集成测试',
  units: [
    {
      unitType: 'SKID',
      templateCode: 'skid-g',
      name: '滑木箱 G 型',
      lengthMm: crateOuter.lengthMm,
      widthMm: crateOuter.widthMm,
      targetLoadKg: 300,
      loadType: 'uniform',
      params: { ...crateParams, runnerCount: 3, runnerWidthMm: 90 },
      parts: deriveCrateParts({ ...crateParams, runnerCount: 3, runnerWidthMm: 90 }),
    },
  ],
});

const steelStrapParams = {
  ...crateParams,
  frameThicknessMm: 0,
  steelStrapCount: 4,
  strapWidthMm: 30,
  strapDirection: 'both' as const,
};
const steelStrapOuter = deriveCrateOuter(steelStrapParams);

const steelStrapBody = (): PackagingProjectInput => ({
  name: `${projectName}-steel-strap`,
  customerName: '集成测试客户',
  destination: 'export',
  note: '钢带箱集成测试',
  units: [
    {
      unitType: 'STEEL_STRAP',
      templateCode: 'steel-strap-g',
      name: '钢带箱 G 型',
      lengthMm: steelStrapOuter.lengthMm,
      widthMm: steelStrapOuter.widthMm,
      targetLoadKg: 300,
      loadType: 'uniform',
      params: steelStrapParams,
      parts: deriveCrateParts(steelStrapParams),
    },
  ],
});

const frameParams = {
  innerLengthMm: 1200,
  innerWidthMm: 800,
  innerHeightMm: 900,
  frameThicknessMm: 90,
  bottomThicknessMm: 15,
  baseHeightMm: 90,
  panelThicknessMm: 15,
  panelCoverage: 'none' as const,
  hasLid: true,
  steelStrapCount: 0,
};
const frameOuter = deriveFrameOuter(frameParams);

const dividerParams = {
  innerLengthMm: 1200,
  innerWidthMm: 800,
  layerHeightMm: 200,
  layerCount: 2,
  thicknessMm: 8,
  lapWidthMm: 30,
  hingeCount: 4,
};
const dividerOuter = deriveDividerOuter(dividerParams);

const dunnageParams = {
  lengthMm: 1200,
  widthMm: 90,
  thicknessMm: 90,
  quantity: 3,
  arrangement: 'parallel' as const,
};
const dunnageOuter = deriveDunnageOuter(dunnageParams);

const dunnageBody = (): PackagingProjectInput => ({
  name: `${projectName}-dunnage`,
  customerName: '集成测试客户',
  destination: 'export',
  note: '垫木集成测试',
  units: [
    {
      unitType: 'DUNNAGE',
      templateCode: 'dunnage-g',
      name: '垫木 G 型',
      lengthMm: dunnageOuter.lengthMm,
      widthMm: dunnageOuter.widthMm,
      targetLoadKg: 100,
      loadType: 'uniform',
      params: dunnageParams,
      parts: deriveDunnageParts(dunnageParams),
    },
  ],
});

const dividerBody = (): PackagingProjectInput => ({
  name: `${projectName}-divider`,
  customerName: '集成测试客户',
  destination: 'export',
  note: '围板集成测试',
  units: [
    {
      unitType: 'DIVIDER',
      templateCode: 'divider-g',
      name: '围板 G 型',
      lengthMm: dividerOuter.lengthMm,
      widthMm: dividerOuter.widthMm,
      targetLoadKg: 100,
      loadType: 'uniform',
      params: dividerParams,
      parts: deriveDividerParts(dividerParams),
    },
  ],
});

const frameBody = (): PackagingProjectInput => ({
  name: `${projectName}-frame`,
  customerName: '集成测试客户',
  destination: 'export',
  note: '框架箱集成测试',
  units: [
    {
      unitType: 'FRAME',
      templateCode: 'frame-g',
      name: '框架箱 G 型',
      lengthMm: frameOuter.lengthMm,
      widthMm: frameOuter.widthMm,
      targetLoadKg: 300,
      loadType: 'uniform',
      params: frameParams,
      parts: deriveFrameParts(frameParams),
    },
  ],
});

describe('包装设计接口（契约/集成）', () => {
  let app: INestApplication;
  let prisma: PrismaService;
  let db: PrismaService['client'];
  let accessToken: string;
  const username = `it-packaging-user-${Date.now()}`;
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
      data: {
        tenantId: TEST_TENANT_ID,
        username,
        passwordHash: await hash(password),
        role: 'SALES',
      },
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
    await db.packagingProject.deleteMany({ where: { name: { startsWith: 'it-packaging-' } } });
    await scopedClient(prisma.client, 'it-tenant-other').packagingProject.deleteMany({
      where: { name: { startsWith: 'it-packaging-' } },
    });
    await db.user.deleteMany({ where: { username: { startsWith: 'it-packaging-user-' } } });
    await db.eventLog.deleteMany({ where: { actorUsername: username } });
    await app.close();
  });

  const http = () => request(app.getHttpServer());
  const auth = (req: request.Test): request.Test =>
    req.set('Authorization', `Bearer ${accessToken}`);

  it('未登录访问一律 401', async () => {
    const res = await http().get(`/${API_PREFIX}/packaging/projects`);
    expect(res.status).toBe(401);
  });

  it('工人无包装设计权限：列表与新建均 403', async () => {
    const workerName = `it-packaging-user-worker-${Date.now()}`;
    await db.user.create({
      data: {
        tenantId: TEST_TENANT_ID,
        username: workerName,
        passwordHash: await hash('Secret#12345'),
        role: 'WORKER',
      },
    });
    const login = await http().post(`/${API_PREFIX}/auth/login`).send({
      tenantCode: TEST_TENANT_CODE,
      username: workerName,
      password: 'Secret#12345',
      rememberMe: false,
    });
    const token = login.body.accessToken as string;
    const worker = (req: request.Test): request.Test => req.set('Authorization', `Bearer ${token}`);

    const list = await worker(http().get(`/${API_PREFIX}/packaging/projects`));
    expect(list.status).toBe(403);
    const create = await worker(http().post(`/${API_PREFIX}/packaging/projects`)).send(body());
    expect(create.status).toBe(403);

    await db.eventLog.deleteMany({ where: { actorUsername: workerName } });
    await db.user.deleteMany({ where: { username: workerName } });
  });

  it('功能关闭：包装设计接口返回 FEATURE_DISABLED', async () => {
    const tenantService = app.get(TenantService);
    await tenantService.setFeatures(TEST_TENANT_ID, {
      overrides: [{ featureCode: 'packaging_design', enabled: false }],
    });
    try {
      const res = await auth(http().get(`/${API_PREFIX}/packaging/projects`));
      expect(res.status).toBe(403);
      expect(res.body.code).toBe('FEATURE_DISABLED');
    } finally {
      await tenantService.setFeatures(TEST_TENANT_ID, { overrides: [] });
    }
  });

  it('租户隔离：他租户方案不可见', async () => {
    const otherDb = scopedClient(prisma.client, 'it-tenant-other');
    const created = await otherDb.packagingProject.create({
      data: {
        tenantId: 'it-tenant-other',
        code: 'PD-99999',
        name: `${projectName}-other`,
        destination: 'EXPORT',
      },
    });
    try {
      const detail = await auth(http().get(`/${API_PREFIX}/packaging/projects/${created.id}`));
      expect(detail.status).toBe(404);
      const list = await auth(http().get(`/${API_PREFIX}/packaging/projects`)).query({
        keyword: `${projectName}-other`,
      });
      expect(list.body.total).toBe(0);
    } finally {
      await otherDb.packagingProject.deleteMany({ where: { id: created.id } });
    }
  });

  it('材料目录与模板目录只读返回预置数据', async () => {
    const materials = await auth(http().get(`/${API_PREFIX}/packaging/materials`));
    expect(materials.status).toBe(200);
    expect(materials.body.length).toBeGreaterThanOrEqual(11);
    expect(materials.body[0].code).toBe('pine');

    const templates = await auth(http().get(`/${API_PREFIX}/packaging/templates`)).query({
      unitType: 'PALLET',
    });
    expect(templates.status).toBe(200);
    expect(templates.body.length).toBeGreaterThanOrEqual(6);
    expect(templates.body[0].code).toBe('block');
  });

  it('新建：PD 编号，服务端重算单元总高与体积', async () => {
    const res = await auth(http().post(`/${API_PREFIX}/packaging/projects`)).send(body());
    expect(res.status).toBe(201);
    expect(String(res.body.code)).toMatch(/^PD-\d{5}$/);
    expect(res.body.units).toHaveLength(1);
    expect(res.body.units[0].unitType).toBe('PALLET');
    expect(res.body.units[0].totalHeightMm).toBe(130);
    expect(Number(res.body.totalVolumeM3)).toBeCloseTo(0.0267, 4);
    expect(res.body.units[0].parts).toHaveLength(4);
    projectId = res.body.id as string;
  });

  it('木箱 G 型：模板解释、几何与料单', async () => {
    const res = await auth(http().post(`/${API_PREFIX}/packaging/projects`)).send(crateBody());
    expect(res.status).toBe(201);
    expect(res.body.units[0].unitType).toBe('CRATE');
    expect(res.body.units[0].totalHeightMm).toBe(1020);
    expect(res.body.units[0].parts).toHaveLength(7);
    expect(Number(res.body.totalVolumeM3)).toBeGreaterThan(0);
  });

  it('滑木箱：创建、几何与料单', async () => {
    const res = await auth(http().post(`/${API_PREFIX}/packaging/projects`)).send(skidBody());
    expect(res.status).toBe(201);
    expect(res.body.units[0].unitType).toBe('SKID');
    expect(res.body.units[0].totalHeightMm).toBe(1020);
    expect(res.body.units[0].parts).toHaveLength(7);
    await db.packagingProject.deleteMany({ where: { name: `${projectName}-skid` } });
  });

  it('钢带箱：无框架、纵横钢带与料单', async () => {
    const res = await auth(http().post(`/${API_PREFIX}/packaging/projects`)).send(steelStrapBody());
    expect(res.status).toBe(201);
    expect(res.body.units[0].unitType).toBe('STEEL_STRAP');
    expect(res.body.units[0].lengthMm).toBe(1230);
    expect(res.body.units[0].widthMm).toBe(830);
    expect(res.body.units[0].totalHeightMm).toBe(1020);
    expect(res.body.units[0].parts).toHaveLength(7);
    expect(res.body.units[0].parts.some((part: { role: string }) => part.role === 'frame')).toBe(
      false,
    );
    const straps = res.body.units[0].parts.filter(
      (part: { role: string }) => part.role === 'steelStrap',
    );
    expect(straps).toHaveLength(2);
    expect(straps.reduce((sum: number, part: { quantity: number }) => sum + part.quantity, 0)).toBe(
      4,
    );
    await db.packagingProject.deleteMany({ where: { name: `${projectName}-steel-strap` } });
  });

  it('框架箱：默认无面板、框架构件与料单', async () => {
    const res = await auth(http().post(`/${API_PREFIX}/packaging/projects`)).send(frameBody());
    expect(res.status).toBe(201);
    expect(res.body.units[0].unitType).toBe('FRAME');
    expect(res.body.units[0].lengthMm).toBe(1380);
    expect(res.body.units[0].widthMm).toBe(980);
    expect(res.body.units[0].totalHeightMm).toBe(1110);
    expect(res.body.units[0].parts).toHaveLength(7);
    expect(
      res.body.units[0].parts.find((part: { name: string }) => part.name === '立柱')?.quantity,
    ).toBe(4);
    expect(res.body.units[0].parts.some((part: { role: string }) => part.role === 'panel')).toBe(
      false,
    );
    await db.packagingProject.deleteMany({ where: { name: `${projectName}-frame` } });
  });

  it('围板：层叠构件、几何与料单', async () => {
    const res = await auth(http().post(`/${API_PREFIX}/packaging/projects`)).send(dividerBody());
    expect(res.status).toBe(201);
    expect(res.body.units[0].unitType).toBe('DIVIDER');
    expect(res.body.units[0].lengthMm).toBe(1216);
    expect(res.body.units[0].widthMm).toBe(816);
    expect(res.body.units[0].totalHeightMm).toBe(400);
    expect(res.body.units[0].parts).toHaveLength(3);
    expect(
      res.body.units[0].parts.find((part: { name: string }) => part.name === '长围板')?.quantity,
    ).toBe(4);
    await db.packagingProject.deleteMany({ where: { name: `${projectName}-divider` } });
  });

  it('垫木：平行排列、几何与料单', async () => {
    const res = await auth(http().post(`/${API_PREFIX}/packaging/projects`)).send(dunnageBody());
    expect(res.status).toBe(201);
    expect(res.body.units[0].unitType).toBe('DUNNAGE');
    expect(res.body.units[0].lengthMm).toBe(1200);
    expect(res.body.units[0].widthMm).toBe(270);
    expect(res.body.units[0].totalHeightMm).toBe(90);
    expect(res.body.units[0].parts).toHaveLength(1);
    expect(res.body.units[0].parts[0].quantity).toBe(3);
    await db.packagingProject.deleteMany({ where: { name: `${projectName}-dunnage` } });
  });

  it('未开放单元类型返回 400', async () => {
    const source = body();
    const res = await auth(http().post(`/${API_PREFIX}/packaging/projects`)).send({
      ...source,
      name: `${projectName}-archived-type`,
      units: source.units.map((unit) => ({ ...unit, unitType: 'CUSTOM' })),
    });
    expect(res.status).toBe(400);
  });

  it('列表与详情返回方案、单元与构件', async () => {
    const list = await auth(http().get(`/${API_PREFIX}/packaging/projects`)).query({
      keyword: projectName,
      page: 1,
      pageSize: 20,
    });
    expect(list.status).toBe(200);
    expect(list.body.total).toBe(2);
    const palletItem = list.body.items.find(
      (item: { unitType: string }) => item.unitType === 'PALLET',
    );
    expect(palletItem?.unitCount).toBe(1);

    const detail = await auth(http().get(`/${API_PREFIX}/packaging/projects/${projectId}`));
    expect(detail.status).toBe(200);
    expect(detail.body.code).toBe(palletItem?.code);
    expect(detail.body.units[0].parts[0].seq).toBe(1);
    expect(detail.body.units[0].params.deck.top).toEqual({ mode: 'manual', count: 5 });
  });

  it('更新：整单替换单元与构件并重算', async () => {
    const source = body();
    const updated: PackagingProjectInput = {
      ...source,
      note: '更新后的备注',
      units: source.units.map((unit) => ({
        ...unit,
        parts: unit.parts.map((part) =>
          part.role === 'topDeck' ? { ...part, quantity: 6 } : part,
        ),
      })),
    };
    const res = await auth(http().put(`/${API_PREFIX}/packaging/projects/${projectId}`)).send(
      updated,
    );
    expect(res.status).toBe(200);
    expect(res.body.note).toBe('更新后的备注');
    expect(
      res.body.units[0].parts.find((item: { role: string }) => item.role === 'topDeck').quantity,
    ).toBe(6);
  });

  it('复制：生成新编号', async () => {
    const res = await auth(http().post(`/${API_PREFIX}/packaging/projects/${projectId}/duplicate`));
    expect(res.status).toBe(201);
    expect(res.body.id).not.toBe(projectId);
    expect(res.body.name).toContain('副本');
    await db.packagingProject.deleteMany({ where: { id: res.body.id } });
  });

  it('发布：生成不可变版本，之后更新被拒绝', async () => {
    const issued = await auth(http().post(`/${API_PREFIX}/packaging/projects/${projectId}/issue`));
    expect(issued.status).toBe(201);
    expect(issued.body.revisionNo).toBe(1);

    const revisions = await auth(
      http().get(`/${API_PREFIX}/packaging/projects/${projectId}/revisions`),
    );
    expect(revisions.status).toBe(200);
    expect(revisions.body.total).toBe(1);

    // 已发布方案复制结果一律为草稿
    const duplicated = await auth(
      http().post(`/${API_PREFIX}/packaging/projects/${projectId}/duplicate`),
    );
    expect(duplicated.status).toBe(201);
    expect(duplicated.body.status).toBe('DRAFT');
    await db.packagingProject.deleteMany({ where: { id: duplicated.body.id } });

    const attempt = await auth(http().put(`/${API_PREFIX}/packaging/projects/${projectId}`)).send(
      body(),
    );
    expect(attempt.status).toBe(409);
  });

  it('新建下一版本：状态回到草稿，历史快照保留', async () => {
    const res = await auth(
      http().post(`/${API_PREFIX}/packaging/projects/${projectId}/next-revision`),
    );
    expect(res.status).toBe(201);
    expect(res.body.status).toBe('DRAFT');
    const revisions = await auth(
      http().get(`/${API_PREFIX}/packaging/projects/${projectId}/revisions`),
    );
    expect(revisions.body.total).toBe(1);
  });

  it('删除：软删除后详情 404，编号不回收', async () => {
    const removed = await auth(http().delete(`/${API_PREFIX}/packaging/projects/${projectId}`));
    expect(removed.status).toBe(204);
    const detail = await auth(http().get(`/${API_PREFIX}/packaging/projects/${projectId}`));
    expect(detail.status).toBe(404);
    const row = await db.packagingProject.findFirst({ where: { id: projectId } });
    expect(row?.deletedAt).not.toBeNull();
  });
});
