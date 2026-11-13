import { expect, test } from '@playwright/test';

// 审计日志页（product/审计日志.md R-审计-001；design/审计日志.md §7）：
// 管理员从入口进入，按操作人筛选，能看到自己刚完成的新建客户操作（动作、对象编号、结果）。
test.use({ viewport: { width: 1280, height: 800 } });

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

test('管理员查询审计日志并筛出自己的写操作', async ({ page }) => {
  const customerName = `e2e-audit-${Date.now()}`;

  await page.goto('/login');
  await page.getByPlaceholder('请输入账号').fill('admin');
  await page.getByPlaceholder('请输入密码').fill('Mcc@2026');
  await page.getByRole('button', { name: '登录' }).click();
  await expect(page).toHaveURL(/\/admin$/);

  const refresh = await page.request.post('/api/v1/auth/refresh', { data: {} });
  const { accessToken } = (await refresh.json()) as { accessToken: string };
  const auth = { Authorization: `Bearer ${accessToken}` };

  const created = await page.request.post('/api/v1/customers', {
    data: { name: customerName, contact: '', note: '' },
    headers: auth,
  });
  expect(created.ok()).toBeTruthy();
  const customer = (await created.json()) as { id: string; code: string };

  try {
    // 头像下拉入口存在（平台机制页面）
    await page.getByRole('button', { name: '账号菜单' }).click();
    await expect(page.getByRole('menuitem', { name: '审计日志' })).toBeVisible();
    await page.keyboard.press('Escape');

    await page.goto('/admin/audit-logs');
    await expect(page.getByRole('columnheader', { name: '操作人' })).toBeVisible();

    await page.getByPlaceholder('账号名').fill('admin');
    await page.getByRole('button', { name: '查询' }).click();

    // 软删客户后编号可能被下一次测试复用，审计行只增不删，因此取第一条匹配行。
    const row = page.getByRole('row', { name: new RegExp(customer.code) }).first();
    await expect(row).toBeVisible();
    await expect(row).toContainText('新建客户');
    await expect(row).toContainText('成功');
    await expect(row).toContainText('admin');

    // 全站无页面级横向滚动
    const overflow = await page.evaluate(
      () => document.documentElement.scrollWidth - document.documentElement.clientWidth,
    );
    expect(overflow).toBeLessThanOrEqual(0);
  } finally {
    await page.request.delete(`/api/v1/customers/${customer.id}`, { headers: auth });
  }
});
