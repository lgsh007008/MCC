import { expect, test } from '@playwright/test';

// 自助注册冒烟（product/账号与权限.md R-账号与权限-005 / design/账号与权限.md §9）：
// 登录页入口 → 注册企业 → 自动登录进入后台 → 退出 → 新手机号 + 密码登录。
// 每次运行创建独立租户（来源自助注册），用于验证即时开通与自动登录。

test('注册企业 → 自动进入后台 → 退出 → 新手机号登录', async ({ page }) => {
  const stamp = Date.now();
  const companyName = `e2e-注册企业-${stamp}`;
  const adminName = `e2e-管理员-${stamp}`;
  const phone = `137${String(stamp).slice(-8)}`;
  const password = 'Secret#12345';

  await page.goto('/login');
  await page.getByRole('link', { name: '注册企业' }).click();
  await expect(page).toHaveURL(/\/register$/);
  // 与登录页共用 AuthShell：桌面右侧舞台可见（design/账号与权限.md §7）
  await expect(page.getByTestId('register-stage')).toBeVisible();
  await expect(page.getByRole('heading', { name: '注册后，直接开始设计。' })).toBeVisible();

  await page.getByLabel('企业名称').fill(companyName);
  await page.getByLabel('管理员姓名').fill(adminName);
  await page.getByLabel('手机号').fill(phone);
  await page.getByLabel('密码', { exact: true }).fill(password);
  await page.getByLabel('确认密码', { exact: true }).fill(password);
  await page.getByRole('button', { name: '注册并进入' }).click();

  // 注册即开通并自动登录，宽屏进包装设计（当前阶段默认落地页）
  await expect(page).toHaveURL(/\/admin\/packaging-design$/);
  await expect(page.getByPlaceholder('方案名称 / 编号 / 客户名称')).toBeVisible();
  await expect(page.getByRole('link', { name: '销售单', exact: true })).toBeVisible();

  // 退出后用新手机号 + 密码重新登录
  // 登出是整页跳转；等 load 完成再填表，避免地址已变但新页面尚未 hydrate 时输入被重置
  await page.getByRole('button', { name: '账号菜单' }).click();
  await Promise.all([
    page.waitForNavigation({ waitUntil: 'load' }),
    page.getByRole('menuitem', { name: '退出登录' }).click(),
  ]);
  await expect(page).toHaveURL(/\/login$/);

  const phoneInput = page.getByPlaceholder('请输入 11 位手机号');
  const passwordInput = page.getByPlaceholder('请输入密码');
  await phoneInput.fill(phone);
  await expect(phoneInput).toHaveValue(phone);
  await passwordInput.fill(password);
  await expect(passwordInput).toHaveValue(password);
  await page.getByRole('button', { name: '登录', exact: true }).click();
  await expect(page).toHaveURL(/\/admin\/packaging-design$/);
  await expect(page.getByPlaceholder('方案名称 / 编号 / 客户名称')).toBeVisible();
});

test('注册页：手机表单优先，不展示桌面演示舞台', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto('/register');

  await expect(page.getByRole('heading', { name: '注册企业', exact: true })).toBeVisible();
  await expect(page.getByLabel('企业名称')).toBeVisible();
  await expect(page.getByLabel('确认密码', { exact: true })).toBeVisible();
  await expect(page.getByTestId('register-stage')).toBeHidden();
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= document.documentElement.clientWidth,
    ),
  ).toBe(true);
});
