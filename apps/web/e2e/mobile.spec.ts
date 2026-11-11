import { expect, test } from '@playwright/test';

// 移动 Web 冒烟（product/平台布局.md「移动页」；ADR-011）：
// 手机视口登录 → 自动分流 /m → 移动入口 → 销售单卡片列表 → 手机开单（单列大控件）→ 详情 → 返回列表。
// 与 PC 共用同一套 API；不新增后端接口。
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

test('手机登录 → 移动入口 → 开单 → 详情 → 列表', async ({ page }) => {
  const customerName = `e2e 手机客户-${Date.now()}`;

  await page.goto('/login');
  await page.getByPlaceholder('请输入账号').fill('admin');
  await page.getByPlaceholder('请输入密码').fill('Mcc@2026');
  await page.getByRole('button', { name: '登录' }).click();

  // 窄屏登录后自动分流到移动入口（product/平台布局.md 使用端）
  await expect(page).toHaveURL(/\/m$/);
  await expect(page.getByRole('heading', { name: '手机开单' })).toBeVisible();

  // 造一位启用客户（与 PC 共用同一接口；测试结束软删除）
  const refresh = await page.request.post('/api/v1/auth/refresh', { data: {} });
  const { accessToken } = (await refresh.json()) as { accessToken: string };
  const created = await page.request.post('/api/v1/customers', {
    data: { name: customerName },
    headers: { Authorization: `Bearer ${accessToken}` },
  });
  expect(created.ok()).toBeTruthy();
  const customer = (await created.json()) as { id: string };

  try {
    // 移动入口 → 销售单卡片列表
    await page.getByRole('link', { name: /成品销售单/ }).click();
    await expect(page).toHaveURL(/\/m\/sale-orders$/);
    await expect(page.getByRole('heading', { name: '成品销售单' })).toBeVisible();
    // 移动端不展示单据编号（product/order.md 移动页）
    await expect(page.getByText(/SO-\d{5}/)).toHaveCount(0);

    // 新建：单列表单 + 明细行卡片
    await page.getByRole('link', { name: '新建销售单' }).click();
    await expect(page).toHaveURL(/\/m\/sale-orders\/new$/);

    await page.getByLabel('客户', { exact: true }).click();
    await page.getByRole('option', { name: customerName }).click();

    const row = page.getByRole('group', { name: '第 1 行' });
    await row.getByLabel('长度(mm)').fill('3000');
    await row.getByLabel('宽度(mm)').fill('100');
    await row.getByLabel('高度(mm)').fill('20');
    await row.getByLabel('根数').fill('10');
    await row.getByLabel('单价').fill('600.00');

    await page.getByRole('button', { name: '保存' }).click();
    await expect(page).toHaveURL(/\/m\/sale-orders\/[0-9a-f-]{36}$/);
    await expect(page.getByText('合计金额')).toBeVisible();
    await expect(page.getByText(customerName)).toBeVisible();
    await expect(page.getByText(/SO-\d{5}/)).toHaveCount(0);

    // 返回列表：新建的单据以卡片出现
    await page.getByRole('link', { name: '返回列表' }).click();
    await expect(page).toHaveURL(/\/m\/sale-orders$/);
    await expect(page.getByText(customerName).first()).toBeVisible();

    // 列表搜索：按客户名称模糊，回车即查；空结果提示；清除后回全量
    const search = page.getByPlaceholder('搜索客户名称');
    await search.fill(customerName);
    await search.press('Enter');
    await expect(page.getByText(customerName)).toHaveCount(1);
    await search.fill(`不存在-${Date.now()}`);
    await search.press('Enter');
    await expect(page.getByText('暂无销售单')).toBeVisible();
    await page.getByRole('button', { name: '清除搜索' }).click();
    await expect(page.getByText(customerName)).toBeVisible();

    // 移动页无横向滚动（全站硬约束）
    const overflow = await page.evaluate(
      () => document.documentElement.scrollWidth - document.documentElement.clientWidth,
    );
    expect(overflow).toBeLessThanOrEqual(0);

    // 详情删除：单条 + 二次确认 → 回列表且卡片消失
    await page.getByText(customerName).first().click();
    await expect(page.getByRole('heading', { name: '销售单详情' })).toBeVisible();
    await page.getByRole('button', { name: '删除销售单' }).click();
    const confirmDialog = page.getByRole('alertdialog');
    await expect(confirmDialog).toBeVisible();
    await confirmDialog.getByRole('button', { name: '删除', exact: true }).click();
    await expect(page).toHaveURL(/\/m\/sale-orders$/);
    await expect(page.getByText(customerName)).toHaveCount(0);
  } finally {
    await page.request.delete(`/api/v1/customers/${customer.id}`, {
      headers: { Authorization: `Bearer ${accessToken}` },
    });
  }

  // 退出登录：入口页标题行右侧（product/平台布局.md 移动页）
  await page.goto('/m');
  await page.getByRole('button', { name: '退出登录' }).click();
  await expect(page).toHaveURL(/\/login$/);
});
