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
  const username = `e2e-worker-${Date.now()}`;
  const password = 'Worker@2026';

  // 管理员建一个工人账号（没有删除接口，结束时停用）
  await page.goto('/login');
  await page.getByPlaceholder('请输入账号').fill('admin');
  await page.getByPlaceholder('请输入密码').fill('Mcc@2026');
  await page.getByRole('button', { name: '登录' }).click();
  // 窄视口登录后落到移动首页（login/page.tsx 按视口宽度分流）
  await expect(page).toHaveURL(/\/m$/);

  const adminRefresh = await page.request.post('/api/v1/auth/refresh', { data: {} });
  const adminToken = ((await adminRefresh.json()) as { accessToken: string }).accessToken;
  const adminAuth = { Authorization: `Bearer ${adminToken}` };

  const created = await page.request.post('/api/v1/users', {
    data: { username, password, role: 'WORKER' },
    headers: adminAuth,
  });
  expect(created.ok()).toBeTruthy();
  const worker = (await created.json()) as { id: string };

  // 独立上下文登录工人，避免与管理员会话互相覆盖
  const workerContext = await browser.newContext({ viewport: { width: 390, height: 844 } });
  const workerPage = await workerContext.newPage();

  try {
    await workerPage.goto('/login');
    await workerPage.getByPlaceholder('请输入账号').fill(username);
    await workerPage.getByPlaceholder('请输入密码').fill(password);
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
