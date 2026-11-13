import { expect, test } from '@playwright/test';

// 移动资金页冒烟（product/finance.md 移动页；适老化基线）：
// 入口 → 资金流水（登记 / 详情 / 编辑 / 删除）→ 收支汇总（分段切 Tab、口径弹窗）→ 无横向滚动。
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

test('移动资金：登记流水 → 详情 → 编辑 → 删除 → 收支汇总', async ({ page }) => {
  await page.goto('/login');
  await page.getByPlaceholder('请输入账号').fill('admin');
  await page.getByPlaceholder('请输入密码').fill('Mcc@2026');
  await page.getByRole('button', { name: '登录' }).click();
  await expect(page).toHaveURL(/\/m$/);

  const refresh = await page.request.post('/api/v1/auth/refresh', { data: {} });
  const { accessToken } = (await refresh.json()) as { accessToken: string };
  const accountName = `e2e 移动账户-${Date.now()}`;
  const accountRes = await page.request.post('/api/v1/finance/accounts', {
    data: {
      name: accountName,
      kind: 'personal',
      channel: 'cash',
      openingBalance: '0.00',
      active: true,
    },
    headers: { Authorization: `Bearer ${accessToken}` },
  });
  expect(accountRes.ok()).toBeTruthy();
  const account = (await accountRes.json()) as { id: string };

  try {
    // 入口 → 资金二级页 → 资金流水
    await page.getByRole('link', { name: /查流水/ }).click();
    await expect(page).toHaveURL(/\/m\/finance$/);
    await page.getByRole('link', { name: '资金流水' }).click();
    await expect(page).toHaveURL(/\/m\/finance\/cash$/);

    // 登记流水：收款 / 其他收入 100.00
    await page.getByRole('link', { name: '登记流水' }).click();
    await expect(page).toHaveURL(/\/m\/finance\/cash\/new$/);
    await page.getByLabel('金额（元）').fill('100.00');
    await page.getByLabel('资金账户').click();
    await page.getByRole('option', { name: accountName }).click();
    await page.getByLabel('收支分类').click();
    await page.getByRole('option', { name: '其他收入' }).click();
    await page.getByRole('button', { name: '保存' }).click();

    await expect(page).toHaveURL(/\/m\/finance\/cash$/);
    const card = page.getByRole('link', { name: new RegExp(accountName) });
    await expect(card).toBeVisible();

    // 详情 → 编辑金额 120.00 → 回详情
    await card.click();
    await expect(page).toHaveURL(/\/m\/finance\/cash\/[0-9a-f-]{36}$/);
    await expect(page.getByText('其他收入', { exact: true })).toBeVisible();
    await page.getByRole('link', { name: '编辑' }).click();
    await expect(page).toHaveURL(/\/m\/finance\/cash\/[0-9a-f-]{36}\/edit$/);
    await page.getByLabel('金额（元）').fill('120.00');
    await page.getByRole('button', { name: '保存' }).click();
    await expect(page.getByText('+120.00 元')).toBeVisible();

    // 收支汇总：分段按钮切「资金收付」→ 资金总额与口径弹窗
    await page.goto('/m/finance/summary');
    await expect(page).toHaveURL(/\/m\/finance\/summary$/);
    await page.getByRole('radio', { name: '资金收付' }).click();
    await expect(page).toHaveURL(/\?tab=funds$/);
    await expect(page.getByText('当前资金总额 · 此刻')).toBeVisible();
    await page.getByRole('button', { name: '口径说明' }).click();
    await expect(page.getByText('资金收付口径说明')).toBeVisible();
    await page.getByRole('button', { name: '关闭', exact: true }).click();
    await expect(page.getByText('资金收付口径说明')).toHaveCount(0);

    // 移动页无横向滚动（全站硬约束）
    const overflow = await page.evaluate(
      () => document.documentElement.scrollWidth - document.documentElement.clientWidth,
    );
    expect(overflow).toBeLessThanOrEqual(0);

    // 删除流水：回列表
    await page.goto('/m/finance/cash');
    await page.getByRole('link', { name: new RegExp(accountName) }).click();
    await page.getByRole('button', { name: '删除', exact: true }).click();
    const confirmDialog = page.getByRole('alertdialog');
    await expect(confirmDialog).toBeVisible();
    await confirmDialog.getByRole('button', { name: '删除', exact: true }).click();
    await expect(page).toHaveURL(/\/m\/finance\/cash$/);
    await expect(page.getByRole('link', { name: new RegExp(accountName) })).toHaveCount(0);
  } finally {
    await page.request.delete(`/api/v1/finance/accounts/${account.id}`, {
      headers: { Authorization: `Bearer ${accessToken}` },
    });
  }
});
