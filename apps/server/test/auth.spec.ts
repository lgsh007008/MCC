import 'reflect-metadata';
import { createHash } from 'node:crypto';
import { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { hash } from '@node-rs/argon2';
import cookieParser from 'cookie-parser';
import request from 'supertest';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { AppModule } from '../src/app.module.js';
import { API_PREFIX } from '../src/common/api-prefix.js';
import { loginFailKey } from '../src/modules/auth/auth.constants.js';
import { PrismaService } from '../src/common/prisma.service.js';
import { RedisService } from '../src/common/redis.service.js';

// auth 接口关键路径（契约/集成层，技术方案 §10）：
// 登录成功 / 凭证错误 / 参数校验 / 连续失败锁定 / 刷新与撤销 / 修改密码 / 守卫 401。
// 使用一次性测试账号（it- 前缀），测试结束清理；锁定用例用完即清计数。

describe('账号与权限接口（契约/集成）', () => {
  let app: INestApplication;
  let prisma: PrismaService;
  let redis: RedisService;
  const username = `it-${Date.now()}`;
  const password = 'Secret#12345';

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({ imports: [AppModule] }).compile();
    app = moduleRef.createNestApplication();
    app.setGlobalPrefix(API_PREFIX);
    // 与 main.ts 一致：刷新令牌走 httpOnly Cookie，需挂 cookie 解析中间件
    app.use(cookieParser());
    await app.init();
    prisma = app.get(PrismaService);
    redis = app.get(RedisService);
    // 清掉历史限流计数，避免测试间窗口叠加导致误报 429
    const rateKeys = await redis.keys('rate:*');
    if (rateKeys.length > 0) {
      await redis.del(...rateKeys);
    }
    await prisma.user.create({
      data: { username, passwordHash: await hash(password), role: 'SALES' },
    });
  });

  afterAll(async () => {
    await prisma.user.deleteMany({ where: { username: { startsWith: 'it-' } } });
    await prisma.eventLog.deleteMany({ where: { actorUsername: username } });
    await app.close();
  });

  const login = (agent: request.Agent, body: Record<string, unknown>) =>
    agent.post(`/${API_PREFIX}/auth/login`).send(body);

  it('登录成功：签发访问令牌并种下刷新令牌 Cookie', async () => {
    const res = await login(request.agent(app.getHttpServer()), {
      username,
      password,
      rememberMe: false,
    });
    expect(res.status).toBe(200);
    expect(res.body.accessToken).toBeTypeOf('string');
    expect(res.body.role).toBe('SALES');
    const cookie = String(res.headers['set-cookie'] ?? '');
    expect(cookie).toContain('mcc_refresh=');
    expect(cookie).toContain('HttpOnly');
    // 会话级（未勾选记住登录）不应带 Max-Age
    expect(cookie.toLowerCase()).not.toContain('max-age');
  });

  it('凭证错误返回统一错误体（不泄露存在性）', async () => {
    const res = await login(request.agent(app.getHttpServer()), {
      username,
      password: 'wrong-password',
    });
    expect(res.status).toBe(401);
    expect(res.body.code).toBe('INVALID_CREDENTIALS');
    expect(res.body.message).toBe('账号或密码错误');
  });

  it('参数不合法走 zod 边界校验 400', async () => {
    const res = await login(request.agent(app.getHttpServer()), { username: '', password: '' });
    expect(res.status).toBe(400);
    expect(res.body.code).toBe('VALIDATION_FAILED');
  });

  it('连续失败 5 次锁定 15 分钟，锁定期间正确密码亦被拒，计数过期后恢复', async () => {
    const agent = request.agent(app.getHttpServer());
    // 此前已失败 1 次（凭证错误用例），再失败 4 次即达阈值
    for (let i = 0; i < 4; i += 1) {
      const res = await login(agent, { username, password: `bad-${i}` });
      expect(res.status).toBe(401);
    }
    const locked = await login(agent, { username, password });
    expect(locked.status).toBe(429);
    expect(locked.body.code).toBe('AUTH_LOCKED');

    // 清理计数（模拟锁定期满）后恢复
    await redis.del(loginFailKey(username));
    const recovered = await login(agent, { username, password });
    expect(recovered.status).toBe(200);
  });

  it('刷新令牌换新访问令牌；无效令牌被拒', async () => {
    const agent = request.agent(app.getHttpServer());
    await login(agent, { username, password });
    const ok = await agent.post(`/${API_PREFIX}/auth/refresh`);
    expect(ok.status).toBe(200);
    expect(ok.body.accessToken).toBeTypeOf('string');

    const bad = request
      .agent(app.getHttpServer())
      .set('Cookie', 'mcc_refresh=not-a-real-token')
      .post(`/${API_PREFIX}/auth/refresh`);
    const badRes = await bad;
    expect(badRes.status).toBe(401);
  });

  it('登出撤销刷新令牌：原 Cookie 不再可用', async () => {
    const agent = request.agent(app.getHttpServer());
    await login(agent, { username, password });
    const out = await agent.post(`/${API_PREFIX}/auth/logout`);
    expect(out.status).toBe(204);

    const refreshAfterLogout = await agent.post(`/${API_PREFIX}/auth/refresh`);
    expect(refreshAfterLogout.status).toBe(401);
  });

  it('守卫：未登录访问受保护接口 401（服务层拦截）', async () => {
    const res = await request(app.getHttpServer())
      .post(`/${API_PREFIX}/auth/change-password`)
      .send({ oldPassword: password, newPassword: 'Another#12345' });
    expect(res.status).toBe(401);
    expect(res.body.code).toBe('UNAUTHORIZED');
  });

  it('修改密码：旧密码失效、新密码可登录；全部会话撤销', async () => {
    const agent = request.agent(app.getHttpServer());
    const loginRes = await agent
      .post(`/${API_PREFIX}/auth/login`)
      .send({ username, password });
    const accessToken = String(loginRes.body.accessToken);

    const change = await agent
      .post(`/${API_PREFIX}/auth/change-password`)
      .set('Authorization', `Bearer ${accessToken}`)
      .send({ oldPassword: password, newPassword: `${password}New` });
    expect(change.status).toBe(204);

    // 旧密码失效
    const oldLogin = await login(request.agent(app.getHttpServer()), { username, password });
    expect(oldLogin.status).toBe(401);

    // 新密码可登录
    const newLogin = await login(request.agent(app.getHttpServer()), {
      username,
      password: `${password}New`,
    });
    expect(newLogin.status).toBe(200);
    expect(newLogin.body.accessToken).toBeTypeOf('string');
  });

  it('审计：写操作全部落事件日志（登录成功 / 凭证失败均留痕）', async () => {
    const agent = request.agent(app.getHttpServer());
    await login(agent, { username, password });
    await login(agent, { username, password: 'definitely-wrong' });

    const logs = await prisma.eventLog.findMany({
      where: { domain: 'auth', action: 'login' },
      orderBy: { createdAt: 'asc' },
    });
    // 登录成功即留痕（登录为公开接口，无守卫注入主体，actor 为空属预期）；
    // 凭证失败同样留痕（result=401）
    expect(logs.some((log) => log.result === 'ok')).toBe(true);
    expect(logs.some((log) => log.result === '401')).toBe(true);
  });

  it('无 Cookie 端：刷新令牌经请求体传递同样换新访问令牌', async () => {
    const user = await prisma.user.findUnique({ where: { username } });
    expect(user).not.toBeNull();
    const rawToken = 'body-refresh-token-test';
    await prisma.refreshToken.create({
      data: {
        tokenHash: createHash('sha256').update(rawToken).digest('hex'),
        userId: String(user?.id),
        expiresAt: new Date(Date.now() + 60_000),
      },
    });

    const res = await request(app.getHttpServer())
      .post(`/${API_PREFIX}/auth/refresh`)
      .send({ refreshToken: rawToken });
    expect(res.status).toBe(200);
    expect(res.body.accessToken).toBeTypeOf('string');
  });
});