import { expect, test } from '@playwright/test';

// 销售单现结联动（product/finance.md R-财务-002「一次录入」）：
// 现结保存 → 收款流水按实收自动生成（来源只读）→ 改赊销后流水回退 → 删除。
// 数据经接口准备（账户复用 / 客户），测试结束删除订单与客户。

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

test('销售单现结：实收与差额、自动收款流水、改赊销回退', async ({ page }) => {
  const stamp = Date.now();
  const accountName = `e2e现结账户-${stamp}`;
  const customerName = `e2e 现结客户-${stamp}`;

  await page.goto('/login');
  await page.getByPlaceholder('请输入账号').fill('admin');
  await page.getByPlaceholder('请输入密码').fill('Mcc@2026');
  await page.getByRole('button', { name: '登录' }).click();
  await expect(page).toHaveURL(/\/admin$/);

  const refresh = await page.request.post('/api/v1/auth/refresh', { data: {} });
  const { accessToken } = (await refresh.json()) as { accessToken: string };
  const auth = { Authorization: `Bearer ${accessToken}` };

  // 资金账户：每次运行独立创建（收款账户下拉只列启用账户，不复用可能已停用的历史账户）
  const created = await page.request.post('/api/v1/finance/accounts', {
    headers: auth,
    data: {
      name: accountName,
      kind: 'corporate',
      channel: 'bank',
      openingBalance: '0.00',
    },
  });
  expect(created.ok()).toBeTruthy();
  const accountId = ((await created.json()) as { id: string }).id;

  const customerRes = await page.request.post('/api/v1/customers', {
    headers: auth,
    data: { name: customerName },
  });
  expect(customerRes.ok()).toBeTruthy();
  const customer = (await customerRes.json()) as { id: string };
  let orderId = '';

  try {
    // 新建销售单：方量 0.06 m³ × 10000 = 合计 600.00
    await page.goto('/admin/sale-orders/new');
    await page.getByLabel('客户', { exact: true }).click();
    await page.getByRole('option', { name: customerName }).click();
    const row = page.locator('tbody tr').first();
    const cellInput = (index: number): ReturnType<typeof row.locator> =>
      row.locator('td').nth(index).locator('input');
    await cellInput(0).fill('3000');
    await cellInput(1).fill('100');
    await cellInput(2).fill('20');
    await cellInput(3).fill('10');
    await cellInput(6).fill('10000.00');

    // 现结：实收默认等于合计，可改为 580.00（抹零 20.00）
    await page.getByLabel('结算方式').click();
    await page.getByRole('option', { name: '现结' }).click();
    await page.getByLabel('收款账户').click();
    await page.getByRole('option', { name: accountName }).click();
    await expect(page.getByLabel('实收金额')).toHaveValue('600.00');
    await page.getByLabel('实收金额').fill('580.00');
    await expect(page.getByText('差额 20.00')).toBeVisible();
    await page.getByRole('button', { name: '保存' }).click();

    await expect(page).toHaveURL(/\/admin\/sale-orders\/[0-9a-f-]{36}$/);
    orderId = page.url().split('/').pop() ?? '';
    await expect(page.getByText('现结', { exact: true })).toBeVisible();
    await expect(page.getByText('实收 580.00', { exact: false })).toBeVisible();

    // 资金流水：来源「销售单 SO-」的派生行，金额 +580.00，只读（无编辑 / 删除）
    await page.goto('/admin/finance/cash');
    const derivedRow = page.getByRole('row').filter({ hasText: '销售单 SO-' });
    await expect(derivedRow).toBeVisible();
    await expect(derivedRow).toContainText('+580.00');
    await expect(derivedRow).toContainText('销售回款');
    await expect(derivedRow.getByRole('button', { name: '编辑' })).toHaveCount(0);
    await expect(derivedRow.getByRole('button', { name: '删除' })).toHaveCount(0);

    // 改赊销：派生流水回退
    await page.goto(`/admin/sale-orders/${orderId}/edit`);
    await page.getByLabel('结算方式').click();
    await page.getByRole('option', { name: '赊销' }).click();
    await page.getByRole('button', { name: '保存' }).click();
    await expect(page).toHaveURL(/\/admin\/sale-orders\/[0-9a-f-]{36}$/);
    await page.goto('/admin/finance/cash');
    await expect(page.getByRole('row').filter({ hasText: '销售单 SO-' })).toHaveCount(0);
  } finally {
    if (orderId) {
      await page.request.delete(`/api/v1/sale-orders/${orderId}`, { headers: auth });
    }
    await page.request.delete(`/api/v1/customers/${customer.id}`, { headers: auth });
    await page.request.delete(`/api/v1/finance/accounts/${accountId}`, { headers: auth });
  }
});
