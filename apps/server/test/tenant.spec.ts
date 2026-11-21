import 'reflect-metadata';
import { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { hash } from '@node-rs/argon2';
import request from 'supertest';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { AppModule } from '../src/app.module.js';
import { API_PREFIX } from '../src/common/api-prefix.js';
import { PrismaService } from '../src/common/prisma.service.js';
import { scopedClient, testPhone } from './helpers.js';

// 平台运营与多租户（design/租户.md §10 / design/账号与权限.md §6）：
// 平台登录 → 开通租户（两步）→ 租户管理员额度 → 功能闸门 → 身份互斥 → 停用即时失效 → 平台审计。

describe('平台运营与多租户（契约/集成）', () => {
  let app: INestApplication;
  let prisma: PrismaService;
  let platformToken = '';
  let tenantToken = '';
  let tenantId = '';
  let tenantCode = '';
  let planId = '';
  const stamp = Date.now();
  const platformUsername = `it-ops-${stamp}`;
  const platformPassword = 'Secret#12345';
  const tenantAdminName = 'admin';
  const tenantAdminPhone = `132${String(stamp).slice(-8)}`;
  const tenantAdminPassword = 'Secret#12345';
  const planName = `it-plan-${stamp}`;
  const tenantName = `it-tenant-${stamp}`;

  const http = () => request(app.getHttpServer());
  const ops = (req: request.Test) => req.set('Authorization', `Bearer ${platformToken}`);
  const tenant = (req: request.Test) => req.set('Authorization', `Bearer ${tenantToken}`);

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({ imports: [AppModule] }).compile();
    app = moduleRef.createNestApplication();
    app.setGlobalPrefix(API_PREFIX);
    await app.init();
    prisma = app.get(PrismaService);

    await prisma.client.platformUser.create({
      data: {
        username: platformUsername,
        passwordHash: await hash(platformPassword),
        role: 'PLATFORM_ADMIN',
      },
    });
    const login = await http().post(`/${API_PREFIX}/ops/auth/login`).send({
      username: platformUsername,
      password: platformPassword,
      rememberMe: false,
    });
    expect(login.status).toBe(200);
    platformToken = login.body.accessToken as string;
  });

  afterAll(async () => {
    const db = scopedClient(prisma.client, tenantId || 'it-tenant');
    await db.refreshToken.deleteMany({});
    await db.eventLog.deleteMany({ where: { actorUsername: { startsWith: 'it-' } } });
    await db.user.deleteMany({ where: { username: { startsWith: 'it-' } } }).catch(() => undefined);
    await db.user.deleteMany({ where: { username: tenantAdminName } }).catch(() => undefined);
    await prisma.client.tenantFeature.deleteMany({ where: { tenantId } }).catch(() => undefined);
    await prisma.client.tenant.deleteMany({ where: { id: tenantId } }).catch(() => undefined);
    const plan = await prisma.client.plan.findFirst({ where: { name: planName } });
    if (plan) {
      await prisma.client.planFeature.deleteMany({ where: { planId: plan.id } });
      await prisma.client.plan.deleteMany({ where: { id: plan.id } });
    }
    await prisma.client.platformEventLog.deleteMany({
      where: { actorUsername: platformUsername },
    });
    await prisma.client.platformRefreshToken.deleteMany({
      where: { platformUser: { username: platformUsername } },
    }).catch(() => undefined);
    await prisma.client.platformUser.deleteMany({ where: { username: platformUsername } });
    await app.close();
  });

  it('平台账号不能访问租户业务接口，租户令牌也不能访问 /ops', async () => {
    const opsOnBusiness = await ops(http().get(`/${API_PREFIX}/sale-orders`));
    expect(opsOnBusiness.status).toBe(401);
  });

  it('新建套餐并开通租户：编号 TN-#####，开通只建租户', async () => {
    const plan = await ops(http().post(`/${API_PREFIX}/ops/plans`)).send({
      name: planName,
      maxAccounts: 1,
      featureCodes: ['order'],
      note: '集成测试套餐',
    });
    expect(plan.status).toBe(201);
    planId = plan.body.id as string;

    const created = await ops(http().post(`/${API_PREFIX}/ops/tenants`)).send({
      name: tenantName,
      planId,
      note: '集成测试租户',
    });
    expect(created.status).toBe(201);
    expect(created.body.code).toMatch(/^TN-\d{5,}$/);
    tenantId = created.body.id as string;
    tenantCode = created.body.code as string;

    const admins = await ops(http().get(`/${API_PREFIX}/ops/tenants/${tenantId}/admins`));
    expect(admins.status).toBe(200);
    expect(admins.body.total).toBe(0);
  });

  it('编号跨 5 位边界：已有 TN-99999 时仍能生成更大编号', async () => {
    let boundaryCreated = false;
    const boundary = await prisma.client.tenant.findUnique({ where: { code: 'TN-99999' } });
    if (!boundary) {
      await prisma.client.tenant.create({
        data: { code: 'TN-99999', name: `it-边界-${stamp}`, planId, status: 'ACTIVE' },
      });
      boundaryCreated = true;
    }

    let createdId = '';
    try {
      const created = await ops(http().post(`/${API_PREFIX}/ops/tenants`)).send({
        name: `it-边界新租户-${stamp}`,
        planId,
      });
      expect(created.status).toBe(201);
      const number = Number.parseInt(String(created.body.code).slice('TN-'.length), 10);
      expect(number).toBeGreaterThan(99999);
      createdId = created.body.id as string;
    } finally {
      if (createdId) {
        await prisma.client.tenant.deleteMany({ where: { id: createdId } });
      }
      if (boundaryCreated) {
        await prisma.client.tenant.deleteMany({ where: { code: 'TN-99999' } });
      }
    }
  });

  it('补建租户管理员：首建成功，超出套餐额度 409 QUOTA_EXCEEDED', async () => {
    const first = await ops(http().post(`/${API_PREFIX}/ops/tenants/${tenantId}/admins`)).send({
      username: tenantAdminName,
      phone: tenantAdminPhone,
      password: tenantAdminPassword,
    });
    expect(first.status).toBe(201);
    // 本用例重点是租户/功能链路，先在库内清掉首登改密标记（改密流程由 auth/user 用例覆盖）
    await scopedClient(prisma.client, tenantId).user.updateMany({
      where: { username: tenantAdminName },
      data: { mustChangePassword: false },
    });

    const second = await ops(http().post(`/${API_PREFIX}/ops/tenants/${tenantId}/admins`)).send({
      username: `it-extra-${stamp}`,
      phone: testPhone(`it-extra-${stamp}`),
      password: tenantAdminPassword,
    });
    expect(second.status).toBe(409);
    expect(second.body.code).toBe('QUOTA_EXCEEDED');

    const counts = await ops(
      http().get(`/${API_PREFIX}/ops/tenant-account-counts`).query({ tenantIds: tenantId }),
    );
    expect(counts.status).toBe(200);
    expect(counts.body.items).toEqual([{ tenantId, accountCount: 1 }]);
  });

  it('租户登录：套餐只含订单，客户接口被功能闸门拒绝', async () => {
    const login = await http().post(`/${API_PREFIX}/auth/login`).send({
      phone: tenantAdminPhone,
      password: tenantAdminPassword,
      rememberMe: false,
    });
    expect(login.status).toBe(200);
    tenantToken = login.body.accessToken as string;

    expect((await tenant(http().get(`/${API_PREFIX}/sale-orders`))).status).toBe(200);
    const customer = await tenant(http().get(`/${API_PREFIX}/customers`));
    expect(customer.status).toBe(403);
    expect(customer.body.code).toBe('FEATURE_DISABLED');

    const tenantOnOps = await tenant(http().get(`/${API_PREFIX}/ops/tenants`));
    expect(tenantOnOps.status).toBe(401);
  });

  it('改套餐与功能覆盖即时生效；停用租户后旧令牌立即失效', async () => {
    const plans = await ops(http().get(`/${API_PREFIX}/ops/plans`));
    const standard = (plans.body.items as Array<{ id: string; name: string }>).find(
      (item) => item.name === '标准版',
    );
    expect(standard).toBeDefined();
    const changed = await ops(http().put(`/${API_PREFIX}/ops/tenants/${tenantId}/plan`)).send({
      planId: standard?.id,
    });
    expect(changed.status).toBe(200);
    expect(changed.body.added).toContain('customer');
    expect((await tenant(http().get(`/${API_PREFIX}/customers`))).status).toBe(200);

    // 关闭订单功能：立即返回 FEATURE_DISABLED
    const features = await ops(http().put(`/${API_PREFIX}/ops/tenants/${tenantId}/features`)).send({
      overrides: [{ featureCode: 'order', enabled: false }],
    });
    expect(features.status).toBe(200);
    expect(features.body.effectiveFeatures).not.toContain('order');
    const blocked = await tenant(http().get(`/${API_PREFIX}/sale-orders`));
    expect(blocked.status).toBe(403);
    expect(blocked.body.code).toBe('FEATURE_DISABLED');

    // 停用：epoch + 1，旧访问令牌立即被拒；停用期间登录统一失败提示
    const suspended = await ops(
      http().patch(`/${API_PREFIX}/ops/tenants/${tenantId}/status`),
    ).send({ status: 'suspended' });
    expect(suspended.status).toBe(200);
    expect(suspended.body.status).toBe('suspended');

    const stale = await tenant(http().get(`/${API_PREFIX}/customers`));
    expect(stale.status).toBe(401);
    expect(stale.body.code).toBe('TENANT_SUSPENDED');

    const login = await http().post(`/${API_PREFIX}/auth/login`).send({
      phone: tenantAdminPhone,
      password: tenantAdminPassword,
      rememberMe: false,
    });
    expect(login.status).toBe(401);
    expect(login.body.code).toBe('INVALID_CREDENTIALS');

    // 启用后 epoch 不复位，旧令牌仍不可用
    await ops(http().patch(`/${API_PREFIX}/ops/tenants/${tenantId}/status`)).send({
      status: 'active',
    });
    expect((await tenant(http().get(`/${API_PREFIX}/customers`))).status).toBe(401);
  });

  it('平台审计记录租户开通与启停，且可按目标租户筛选', async () => {
    const logs = await ops(
      http().get(`/${API_PREFIX}/ops/audit-logs`).query({ targetTenant: tenantCode }),
    );
    expect(logs.status).toBe(200);
    const actions = (logs.body.items as Array<{ action: string }>).map((item) => item.action);
    expect(actions).toContain('create-tenant');
    expect(actions).toContain('change-tenant-status');
    expect(JSON.stringify(logs.body)).not.toContain(platformPassword);
  });
});

// 占位结束：无未使用变量。
