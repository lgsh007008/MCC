import { expect, test } from '@playwright/test';

// 移动 Web 路由权限（技术方案 §8.2：PC 与移动共用同一套 scope，不按端拆分；design/平台布局.md §1.8）：
// 工人只读订单，移动端直达采购 / 财务等越权路由时必须被壳拦截，而不是仅靠入口裁剪。
test.use({ viewport: { width: 390, height: 844 } });

test.beforeEach(async ({ page }) => {
  await page.addInitScript(() => {
    const inject = (): void => {
      const style = document.createElement('style');
      style.textContent = 'nextjs-portal{display:none!important}';
      document.head.appendChild(style);
    };
    if (document.head) {
      inject();
    } else {
      document.addEventListener('DOMContentLoaded', inject);
    }
  });
});

test('工人移动端越权路由被拦截，订单只读可访问', async ({ page, browser }) => {
  // 固定账号复用：E2E 无删除接口，重复运行不新增账号，避免占满套餐额度
  const username = 'e2e-worker-permissions';
  const workerPhone = '13800000002';
  const password = 'Worker@2026';

  // 管理员建一个工人账号（没有删除接口，结束时停用）
  await page.goto('/login');
  await page.getByPlaceholder('请输入 11 位手机号').fill('13800000001');
  await page.getByPlaceholder('请输入密码').fill('Mcc@2026');
  await page.getByRole('button', { name: '登录' }).click();
  // 窄视口登录后落到移动首页（login/page.tsx 按视口宽度分流）
  await expect(page).toHaveURL(/\/m$/);

  const adminRefresh = await page.request.post('/api/v1/auth/refresh', { data: {} });
  const adminToken = ((await adminRefresh.json()) as { accessToken: string }).accessToken;
  const adminAuth = { Authorization: `Bearer ${adminToken}` };

  const existingRes = await page.request.get(
    `/api/v1/users?keyword=${encodeURIComponent(username)}&page=1&pageSize=20`,
    { headers: adminAuth },
  );
  const existingList = (await existingRes.json()) as {
    items: Array<{ id: string; username: string }>;
  };
  const existing = existingList.items.find((item) => item.username === username);
  let worker: { id: string };
  if (existing) {
    // 已存在：重置密码并恢复启用，保证可用
    await page.request.post(`/api/v1/users/${existing.id}/reset-password`, {
      data: { password },
      headers: adminAuth,
    });
    await page.request.patch(`/api/v1/users/${existing.id}/phone`, {
      data: { phone: workerPhone },
      headers: adminAuth,
    });
    await page.request.patch(`/api/v1/users/${existing.id}/status`, {
      data: { status: 'active' },
      headers: adminAuth,
    });
    worker = existing;
  } else {
    const created = await page.request.post('/api/v1/users', {
      data: { username, phone: workerPhone, password, role: 'WORKER' },
      headers: adminAuth,
    });
    expect(created.ok()).toBeTruthy();
    worker = (await created.json()) as { id: string };
  }

  // 独立上下文登录工人，避免与管理员会话互相覆盖
  const workerContext = await browser.newContext({ viewport: { width: 390, height: 844 } });
  const workerPage = await workerContext.newPage();

  try {
    await workerPage.goto('/login');
    await workerPage.getByPlaceholder('请输入 11 位手机号').fill(workerPhone);
    await workerPage.getByPlaceholder('请输入密码').fill(password);
    await workerPage.getByRole('button', { name: '登录' }).click();

    // 新建 / 重置后的首次登录必须改密（ADR-015）
    await expect(workerPage.getByRole('dialog')).toBeVisible();
    await workerPage.getByLabel('当前密码').fill(password);
    await workerPage.getByLabel('新密码（至少 8 位）').fill(`${password}New`);
    await workerPage.getByRole('button', { name: '修改并重新登录' }).click();
    await expect(workerPage).toHaveURL(/\/login/);

    await workerPage.getByPlaceholder('请输入 11 位手机号').fill(workerPhone);
    await workerPage.getByPlaceholder('请输入密码').fill(`${password}New`);
    await workerPage.getByRole('button', { name: '登录' }).click();
    await expect(workerPage).toHaveURL(/\/m$/);

    // 无 finance:view → 财务路由被移动壳拦截
    await workerPage.goto('/m/finance');
    await expect(workerPage.getByText('无权限访问该页面。')).toBeVisible();
    await expect(workerPage.getByRole('link', { name: /资金流水/ })).toHaveCount(0);

    // 有 order:view → 销售单列表正常展示
    await workerPage.goto('/m/sale-orders');
    await expect(workerPage.getByRole('heading', { name: '成品销售单' })).toBeVisible();
    await expect(workerPage.getByText('无权限访问该页面。')).toHaveCount(0);
  } finally {
    await workerContext.close();
    await page.request.patch(`/api/v1/users/${worker.id}/status`, {
      data: { status: 'inactive' },
      headers: adminAuth,
    });
  }
});
