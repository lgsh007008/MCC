import { expect, test } from '@playwright/test';

// 阶段一验收冒烟（product/账号与权限.md R-账号与权限-001、product/平台布局.md R-平台布局-001）：
// 登录 → 工作台 → 侧边菜单（含待建标注）→ 退出 → 未登录访问后台弹回登录页。
// 账号：seed 初始化（apps/server/scripts/seed.ts）；密码错误锁定等负面用例见 server 集成测试（test/auth.spec.ts）。

test('登录 → 工作台 → 菜单 → 退出 → 未登录守卫', async ({ page }) => {
  await page.goto('/login');
  await expect(page.getByRole('heading', { name: '登录' })).toBeVisible();

  await page.getByPlaceholder('请输入账号').fill('admin');
  await page.getByPlaceholder('请输入密码').fill('Mcc@2026');
  await page.getByRole('button', { name: '登录' }).click();

  // 登录成功进入工作台
  await expect(page).toHaveURL(/\/admin$/);
  await expect(page.getByRole('heading', { name: '工作台' })).toBeVisible();
  await expect(page.getByText('月度毛利', { exact: true })).toBeVisible();

  // 侧边菜单：9 个分组 + 未建页面的「待建」标注
  await expect(page.getByText('客户', { exact: true })).toBeVisible();
  await expect(page.getByText('待建').first()).toBeVisible();

  // 退出登录 → 回登录页
  await page.getByText('销', { exact: true }).click();
  await page.getByText('退出登录', { exact: true }).click();
  await expect(page).toHaveURL(/\/login$/);

  // 未登录直接访问后台 → 弹回登录页
  await page.goto('/admin');
  await expect(page).toHaveURL(/\/login$/);
});