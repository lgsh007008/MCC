import 'reflect-metadata';
import { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { hash } from '@node-rs/argon2';
import cookieParser from 'cookie-parser';
import request from 'supertest';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { AppModule } from '../src/app.module.js';
import { API_PREFIX } from '../src/common/api-prefix.js';
import { PrismaService } from '../src/common/prisma.service.js';
import { RedisService } from '../src/common/redis.service.js';
import { scopedClient, testPhone } from './helpers.js';

// 自助注册（R-账号与权限-005 / design/账号与权限.md §9）：
// 成功开通标准版租户 + 管理员并自动登录 / 手机号反枚举 / 参数校验 / 开放开关 / 运营按来源筛选。
// 新租户在用例结束后清理，不影响演示数据。

const STANDARD_PLAN_ID = '00000000-0000-4000-8000-000000000001';
const PASSWORD = 'Secret#12345';

describe('自助注册（契约/集成）', () => {
  let app: INestApplication;
  let prisma: PrismaService;
  let redis: RedisService;
  let platformToken = '';
  let tenantId = '';
  const tenantIds: string[] = [];
  const stamp = Date.now();
  const companyName = `it-注册企业-${stamp}`;
  const adminName = `it-reg-${stamp}`;
  const adminPhone = testPhone(`register-${stamp}-owner`);
  const platformUsername = `it-reg-ops-${stamp}`;
  const platformPassword = PASSWORD;

  const http = () => request(app.getHttpServer());

  const register = (body: Record<string, unknown>, agent = request.agent(app.getHttpServer())) =>
    agent.post(`/${API_PREFIX}/auth/register`).send({
      companyName,
      username: adminName,
      phone: adminPhone,
      password: PASSWORD,
      ...body,
    });

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({ imports: [AppModule] }).compile();
    app = moduleRef.createNestApplication();
    app.setGlobalPrefix(API_PREFIX);
    // 与 main.ts 一致：注册成功后种刷新 Cookie，验证自动登录需能读 Cookie
    app.use(cookieParser());
    await app.init();
    prisma = app.get(PrismaService);
    redis = app.get(RedisService);

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

  beforeEach(async () => {
    // 逐用例清空限流计数，避免用例叠加触发平台默认限流
    const keys = await redis.keys('rate:*');
    if (keys.length > 0) {
      await redis.del(...keys);
    }
  });

  afterAll(async () => {
    for (const id of tenantIds) {
      const db = scopedClient(prisma.client, id);
      await db.refreshToken.deleteMany({}).catch(() => undefined);
      await db.eventLog.deleteMany({}).catch(() => undefined);
      await db.user.deleteMany({}).catch(() => undefined);
      await prisma.client.tenant.deleteMany({ where: { id } }).catch(() => undefined);
    }
    await prisma.client.platformRefreshToken
      .deleteMany({ where: { platformUser: { username: platformUsername } } })
      .catch(() => undefined);
    await prisma.client.platformEventLog
      .deleteMany({ where: { actorUsername: platformUsername } })
      .catch(() => undefined);
    await prisma.client.platformUser.deleteMany({ where: { username: platformUsername } });
    await app.close();
  });

  it('注册成功：创建标准版租户与管理员，自动登录且可直接刷新', async () => {
    const agent = request.agent(app.getHttpServer());
    const res = await register({}, agent);
    expect(res.status).toBe(201);
    expect(res.body.accessToken).toBeTypeOf('string');
    expect(res.body.role).toBe('ADMIN');
    expect(res.body.mustChangePassword).toBe(false);
    // 注册默认「记住登录」：刷新令牌 Cookie 带 Max-Age
    const cookie = String(res.headers['set-cookie'] ?? '');
    expect(cookie).toContain('mcc_refresh=');
    expect(cookie.toLowerCase()).toContain('max-age');

    const tenant = await prisma.client.tenant.findFirst({ where: { name: companyName } });
    expect(tenant).not.toBeNull();
    tenantId = tenant!.id;
    tenantIds.push(tenant!.id);
    expect(tenant!.source).toBe('SELF_REGISTER');
    expect(tenant!.planId).toBe(STANDARD_PLAN_ID);
    expect(tenant!.status).toBe('ACTIVE');

    const user = await scopedClient(prisma.client, tenant!.id).user.findFirst({
      where: { phone: adminPhone },
    });
    expect(user?.role).toBe('ADMIN');
    expect(user?.mustChangePassword).toBe(false);
    expect(user?.phoneVerifiedAt).toBeNull();

    // 自动登录：Cookie 可直接换访问令牌
    const refreshed = await agent.post(`/${API_PREFIX}/auth/refresh`);
    expect(refreshed.status).toBe(200);
    expect(refreshed.body.accessToken).toBeTypeOf('string');

    // 退出后可用新手机号 + 密码正常登录
    await agent.post(`/${API_PREFIX}/auth/logout`);
    const login = await http().post(`/${API_PREFIX}/auth/login`).send({
      phone: adminPhone,
      password: PASSWORD,
      rememberMe: false,
    });
    expect(login.status).toBe(200);
  });

  it('手机号已注册返回 409 且不暴露所属租户', async () => {
    const res = await register({ username: `${adminName}-dup` });
    expect(res.status).toBe(409);
    expect(res.body.code).toBe('PHONE_TAKEN');
    expect(res.body.message).toBe('该手机号已注册，请直接登录');
    expect(JSON.stringify(res.body)).not.toContain(companyName);
  });

  it('参数不合法走 zod 边界校验 400', async () => {
    const res = await register({
      companyName: '',
      username: '',
      phone: '123',
      password: 'short',
    });
    expect(res.status).toBe(400);
    expect(res.body.code).toBe('VALIDATION_FAILED');
  });

  it('开放开关关闭时拒绝注册（403 REGISTRATION_CLOSED）', async () => {
    process.env.REGISTRATION_OPEN = 'false';
    try {
      const res = await register({ phone: testPhone(`register-${stamp}-closed`) });
      expect(res.status).toBe(403);
      expect(res.body.code).toBe('REGISTRATION_CLOSED');
    } finally {
      delete process.env.REGISTRATION_OPEN;
    }
  });

  it('运营列表与详情按来源展示：自助注册可筛选，运营开通不含新租户', async () => {
    const ops = (req: request.Test) => req.set('Authorization', `Bearer ${platformToken}`);

    const selfRegistered = await ops(
      http().get(`/${API_PREFIX}/ops/tenants`).query({ name: companyName, source: 'self_register' }),
    );
    expect(selfRegistered.status).toBe(200);
    expect(selfRegistered.body.items).toHaveLength(1);
    expect(selfRegistered.body.items[0].source).toBe('self_register');

    const opsOnly = await ops(
      http().get(`/${API_PREFIX}/ops/tenants`).query({ name: companyName, source: 'ops' }),
    );
    expect(opsOnly.status).toBe(200);
    expect(opsOnly.body.items).toHaveLength(0);

    const detail = await ops(http().get(`/${API_PREFIX}/ops/tenants/${tenantId}`));
    expect(detail.status).toBe(200);
    expect(detail.body.source).toBe('self_register');
  });
});
