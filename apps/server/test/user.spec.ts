import 'reflect-metadata';
import { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { hash } from '@node-rs/argon2';
import request from 'supertest';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { AppModule } from '../src/app.module.js';
import { API_PREFIX } from '../src/common/api-prefix.js';
import { PrismaService } from '../src/common/prisma.service.js';
import { scopedClient, TEST_TENANT_ID } from './helpers.js';

// 账号管理与 RBAC（product/账号与权限.md R-002 / R-003；技术方案 §8.2）：
// 账号接口仅管理员可用；工人只读（订单可看、写与客户/财务/账号拒绝）；
// 停用账号拒绝登录；不能停用自己；账号名冲突 409。

describe('账号管理与 RBAC（契约/集成）', () => {
  let app: INestApplication;
  let prisma: PrismaService;
  let db: PrismaService['client'];
  let adminToken: string;
  let workerToken: string;
  let adminId: string;
  let workerId: string;
  const stamp = Date.now();
  const password = 'Secret#12345';
  const adminName = `it-user-admin-${stamp}`;
  const workerName = `it-user-worker-${stamp}`;
  const adminPhone = `137${String(stamp).slice(-8)}`;
  const workerPhone = `136${String(stamp).slice(-8)}`;
  const salesPhone = `135${String(stamp).slice(-8)}`;

  const login = async (phone: string, pwd: string) => {
    return request(app.getHttpServer()).post(`/${API_PREFIX}/auth/login`).send({
      phone,
      password: pwd,
      rememberMe: false,
    });
  };

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({ imports: [AppModule] }).compile();
    app = moduleRef.createNestApplication();
    app.setGlobalPrefix(API_PREFIX);
    await app.init();
    prisma = app.get(PrismaService);
    db = scopedClient(prisma.client);

    const admin = await db.user.create({
      data: {
        tenantId: TEST_TENANT_ID,
        username: adminName,
        phone: adminPhone,
        passwordHash: await hash(password),
        role: 'ADMIN',
      },
    });
    adminId = admin.id;
    const worker = await db.user.create({
      data: {
        tenantId: TEST_TENANT_ID,
        username: workerName,
        phone: workerPhone,
        passwordHash: await hash(password),
        role: 'WORKER',
      },
    });
    workerId = worker.id;

    const adminLogin = await login(adminPhone, password);
    expect(adminLogin.status).toBe(200);
    adminToken = adminLogin.body.accessToken as string;
    const workerLogin = await login(workerPhone, password);
    expect(workerLogin.status).toBe(200);
    workerToken = workerLogin.body.accessToken as string;
  });

  afterAll(async () => {
    const usernames = [adminName, workerName, `it-user-sales-${stamp}`];
    await db.refreshToken.deleteMany({
      where: { user: { username: { in: usernames } } },
    });
    await db.user.deleteMany({ where: { username: { in: usernames } } });
    await db.eventLog.deleteMany({ where: { actorUsername: { in: usernames } } });
    await app.close();
  });

  const http = () => request(app.getHttpServer());
  const auth = (req: request.Test, token: string): request.Test =>
    req.set('Authorization', `Bearer ${token}`);

  it('未登录访问账号列表 401', async () => {
    const res = await http().get(`/${API_PREFIX}/users`);
    expect(res.status).toBe(401);
  });

  it('非管理员访问账号列表 403', async () => {
    const res = await auth(http().get(`/${API_PREFIX}/users`), workerToken);
    expect(res.status).toBe(403);
    expect(res.body.code).toBe('FORBIDDEN');
  });

  it('工人只读：可看销售单，客户 / 财务 / 账号与写操作均 403', async () => {
    expect((await auth(http().get(`/${API_PREFIX}/sale-orders`), workerToken)).status).toBe(200);
    expect((await auth(http().get(`/${API_PREFIX}/customers`), workerToken)).status).toBe(403);
    expect((await auth(http().get(`/${API_PREFIX}/finance/cash-entries`), workerToken)).status).toBe(403);
    expect((await auth(http().get(`/${API_PREFIX}/users`), workerToken)).status).toBe(403);

    const write = await auth(http().post(`/${API_PREFIX}/sale-orders`), workerToken).send({});
    expect(write.status).toBe(403);
    expect(write.body.code).toBe('FORBIDDEN');
  });

  it('管理员新建账号；重名 409；列表不含密码', async () => {
    const created = await auth(http().post(`/${API_PREFIX}/users`), adminToken).send({
      username: `it-user-sales-${stamp}`,
      phone: salesPhone,
      password,
      role: 'SALES',
    });
    expect(created.status).toBe(201);
    expect(created.body.role).toBe('SALES');
    expect(created.body.status).toBe('active');
    expect(created.body.phone).toBe(salesPhone);

    const duplicate = await auth(http().post(`/${API_PREFIX}/users`), adminToken).send({
      username: `it-user-sales-${stamp}`,
      phone: `134${String(stamp).slice(-8)}`,
      password,
      role: 'SALES',
    });
    expect(duplicate.status).toBe(409);
    expect(duplicate.body.code).toBe('USERNAME_TAKEN');

    const phoneTaken = await auth(http().post(`/${API_PREFIX}/users`), adminToken).send({
      username: `it-user-sales2-${stamp}`,
      phone: salesPhone,
      password,
      role: 'SALES',
    });
    expect(phoneTaken.status).toBe(409);
    expect(phoneTaken.body.code).toBe('PHONE_TAKEN');

    const list = await auth(http().get(`/${API_PREFIX}/users`), adminToken).query({
      page: 1,
      pageSize: 100,
    });
    expect(list.status).toBe(200);
    expect(Number(list.body.total)).toBeGreaterThanOrEqual(2);
    expect(list.body.items.every((item: Record<string, unknown>) => !('passwordHash' in item))).toBe(
      true,
    );
  });

  it('不能停用自己；停用后该账号无法登录', async () => {
    const self = await auth(http().patch(`/${API_PREFIX}/users/${adminId}/status`), adminToken).send({
      status: 'inactive',
    });
    expect(self.status).toBe(400);
    expect(self.body.code).toBe('SELF_INACTIVE');

    const disabled = await auth(
      http().patch(`/${API_PREFIX}/users/${workerId}/status`),
      adminToken,
    ).send({ status: 'inactive' });
    expect(disabled.status).toBe(200);
    expect(disabled.body.status).toBe('inactive');

    const rejected = await login(workerPhone, password);
    expect(rejected.status).toBe(401);
    expect(rejected.body.code).toBe('ACCOUNT_INACTIVE');
  });

  it('重置密码：旧密码失效、新密码首次登录需改密；改角色后按新角色授权', async () => {
    const enabled = await auth(
      http().patch(`/${API_PREFIX}/users/${workerId}/status`),
      adminToken,
    ).send({ status: 'active' });
    expect(enabled.status).toBe(200);

    const reset = await auth(
      http().post(`/${API_PREFIX}/users/${workerId}/reset-password`),
      adminToken,
    ).send({ password: 'NewSecret#123' });
    expect(reset.status).toBe(204);

    expect((await login(workerPhone, password)).status).toBe(401);
    const relogin = await login(workerPhone, 'NewSecret#123');
    expect(relogin.status).toBe(200);
    expect(relogin.body.mustChangePassword).toBe(true);

    // 待改密期间业务接口被拦截
    const blocked = await auth(
      http().get(`/${API_PREFIX}/finance/cash-entries`),
      relogin.body.accessToken as string,
    );
    expect(blocked.status).toBe(403);
    expect(blocked.body.code).toBe('PASSWORD_CHANGE_REQUIRED');

    const change = await auth(
      http().post(`/${API_PREFIX}/auth/change-password`),
      relogin.body.accessToken as string,
    ).send({ oldPassword: 'NewSecret#123', newPassword: 'FinalSecret#123' });
    expect(change.status).toBe(204);

    const finalLogin = await login(workerPhone, 'FinalSecret#123');
    expect(finalLogin.status).toBe(200);
    expect(finalLogin.body.mustChangePassword).toBe(false);

    const changed = await auth(
      http().patch(`/${API_PREFIX}/users/${workerId}/role`),
      adminToken,
    ).send({ role: 'FINANCE' });
    expect(changed.status).toBe(200);
    expect(changed.body.role).toBe('FINANCE');

    const financeLogin = await login(workerPhone, 'FinalSecret#123');
    const financeToken = financeLogin.body.accessToken as string;
    expect((await auth(http().get(`/${API_PREFIX}/finance/cash-entries`), financeToken)).status).toBe(200);
    expect((await auth(http().get(`/${API_PREFIX}/customers`), financeToken)).status).toBe(200);
  });
});
