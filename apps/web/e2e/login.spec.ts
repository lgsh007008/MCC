import { expect, test } from '@playwright/test';

// 阶段一验收冒烟（product/账号与权限.md R-账号与权限-001、product/平台布局.md R-平台布局-001、
// product/order.md R-订单-001）：登录 → 首页（静态欢迎页）→ 侧边菜单（首页 + 订单组 / 销售单，无待建标注）
// → 销售单列表 → 退出 → 未登录访问后台弹回登录页。
// 账号：seed 初始化（apps/server/scripts/seed.ts）；密码错误锁定等负面用例见 server 集成测试（test/auth.spec.ts）。

test('登录 → 首页 → 订单菜单 → 销售单列表 → 退出 → 未登录守卫', async ({ page }) => {
  await page.goto('/login');
  await expect(page.getByRole('heading', { name: '登录' })).toBeVisible();

  await page.getByPlaceholder('请输入账号').fill('admin');
  await page.getByPlaceholder('请输入密码').fill('Mcc@2026');
  await page.getByRole('button', { name: '登录' }).click();

  // 登录成功进入首页（静态欢迎页）
  await expect(page).toHaveURL(/\/admin$/);
  await expect(page.getByRole('heading', { name: '首页' })).toBeVisible();
  await expect(page.getByText('欢迎使用梅好木业数字化系统', { exact: false })).toBeVisible();

  // 侧边菜单：首页 + 订单组（销售单），未建分组不再预置、无「待建」标注
  await expect(page.getByRole('link', { name: '销售单', exact: true })).toBeVisible();
  await expect(page.getByText('待建', { exact: true })).toHaveCount(0);

  // 分组树状折叠：点组标题收起子项，再点展开
  await page.getByRole('button', { name: '订单', exact: true }).click();
  await expect(page.getByRole('link', { name: '销售单', exact: true })).toHaveCount(0);
  await page.getByRole('button', { name: '订单', exact: true }).click();
  await expect(page.getByRole('link', { name: '销售单', exact: true })).toBeVisible();

  // 边栏折叠后点击菜单不自动展开（sidebar_state cookie 保持 false）
  const sidebarState = async (): Promise<string | undefined> =>
    (await page.context().cookies()).find((cookie) => cookie.name === 'sidebar_state')?.value;
  await page.getByRole('button', { name: 'Toggle Sidebar' }).click();
  await expect.poll(sidebarState).toBe('false');
  await page.getByRole('link', { name: '销售单', exact: true }).click();
  await expect(page).toHaveURL(/\/admin\/sale-orders$/);
  await expect.poll(sidebarState).toBe('false');
  // 恢复展开，继续后续流程
  await page.getByRole('button', { name: 'Toggle Sidebar' }).click();
  await expect(page.getByRole('link', { name: '新建', exact: true })).toBeVisible();
  await expect(page.getByRole('columnheader', { name: '编号' })).toBeVisible();
  // 固定合计行（列表页表格底部，汇总标签在编号列）
  await expect(page.getByRole('cell', { name: '合计', exact: true })).toBeVisible();

  // 新建页：明细区行操作「复制行」可用（1 → 2 行）；面包屑页面标识 =「新建」
  await page.goto('/admin/sale-orders/new');
  await expect(page.getByText('共 1 / 50 行')).toBeVisible();
  await page.getByRole('button', { name: '复制行' }).first().click();
  await expect(page.getByText('共 2 / 50 行')).toBeVisible();
  const breadcrumb = page.getByRole('navigation', { name: 'breadcrumb' });
  await expect(breadcrumb.getByText('新建', { exact: true })).toBeVisible();

  // 填写并保存 → 详情页面包屑 = 单号；编辑页面包屑 = 单号 / 编辑
  await page.getByRole('button', { name: '删除行' }).last().click();
  await expect(page.getByText('共 1 / 50 行')).toBeVisible();
  await page.getByPlaceholder('客户名称').fill('e2e-客户');
  await page.getByPlaceholder('2.000').fill('2.000');
  await page.getByPlaceholder('80.000').fill('80.000');
  await page.getByPlaceholder('300.000').fill('300.000');
  await page.getByPlaceholder('根数').fill('3');
  await page.getByPlaceholder('550.25').fill('550.25');
  await page.getByRole('button', { name: '保存' }).click();

  await expect(page).toHaveURL(/\/admin\/sale-orders\/[0-9a-f-]{36}$/);
  await expect(breadcrumb.getByText(/^\d{6}-\d{4}$/)).toBeVisible();
  await page.getByRole('link', { name: '编辑' }).click();
  await expect(page).toHaveURL(/\/edit$/);
  await expect(breadcrumb.getByText('编辑', { exact: true })).toBeVisible();

  // 退出登录 → 回登录页
  await page.getByText('销', { exact: true }).click();
  await page.getByText('退出登录', { exact: true }).click();
  await expect(page).toHaveURL(/\/login$/);

  // 未登录直接访问后台 → 弹回登录页
  await page.goto('/admin/sale-orders');
  await expect(page).toHaveURL(/\/login$/);
});