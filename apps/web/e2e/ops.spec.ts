import { expect, test } from '@playwright/test';

// 平台运营后台冒烟（design/平台布局.md §1.9 / design/租户.md §6）：
// 平台登录 → 租户列表 → 套餐页 → 两步开通（租户 + 首管理员）→ 平台审计 → 退出。
// 账号：seed 初始化 opsadmin / Mcc@2026。

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

test('平台运营：登录 → 租户列表 → 开通租户 → 平台审计', async ({ page }) => {
  const tenantName = `e2e-租户-${Date.now()}`;

  await page.goto('/ops/login');
  await expect(page.getByRole('heading', { name: '平台运营登录' })).toBeVisible();
  await page.getByPlaceholder('请输入平台账号').fill('opsadmin');
  await page.getByPlaceholder('请输入密码').fill('Mcc@2026');
  await page.getByRole('button', { name: '登录' }).click();

  await expect(page).toHaveURL(/\/ops\/tenants$/);
  await expect(page.getByRole('columnheader', { name: '编号' })).toBeVisible();
  await expect(page.getByRole('cell', { name: 'TN-00001', exact: true })).toBeVisible();

  // 套餐页：标准版可见
  await page.getByRole('link', { name: '套餐管理' }).click();
  await expect(page).toHaveURL(/\/ops\/plans$/);
  await expect(page.getByRole('cell', { name: '标准版', exact: true }).first()).toBeVisible();

  // 开通租户：先建租户，再建首管理员
  await page.getByRole('link', { name: '租户管理' }).click();
  await expect(page).toHaveURL(/\/ops\/tenants$/);
  await page.getByRole('button', { name: '开通租户' }).click();
  await expect(page).toHaveURL(/\/ops\/tenants\/new$/);
  await page.getByLabel('租户名称').fill(tenantName);
  await page.getByLabel('套餐').click();
  await page.getByRole('option', { name: /标准版/ }).click();
  await page.getByLabel('账号', { exact: true }).fill('admin');
  await page.getByLabel('初始密码', { exact: true }).fill('Secret#12345');
  await page.getByRole('button', { name: '开通', exact: true }).click();

  await expect(page).toHaveURL(/\/ops\/tenants\/[0-9a-z-]+$/);
  await expect(page.getByText(tenantName, { exact: false })).toBeVisible();
  await expect(page.getByText('admin', { exact: true })).toBeVisible();

  // 平台审计：开通租户已落库，目标租户快照可见
  await page.getByRole('link', { name: '平台审计' }).click();
  await expect(page).toHaveURL(/\/ops\/audit-logs$/);
  await expect(page.getByRole('columnheader', { name: '目标租户' })).toBeVisible();
  await expect(page.getByText(tenantName, { exact: false }).first()).toBeVisible();

  // 退出登录 → 回平台登录页
  await page.getByText('平', { exact: true }).click();
  await page.getByText('退出登录', { exact: true }).click();
  await expect(page).toHaveURL(/\/ops\/login$/);
});
