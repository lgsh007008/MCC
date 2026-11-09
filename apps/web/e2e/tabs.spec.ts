import { expect, test } from '@playwright/test';

// 多标签页（product/平台布局.md「多标签页」；design/平台布局.md §1.6）：
// 打开页面生成标签、同路径去重、关闭当前跳左邻、刷新会话内保留、退出登录清空。

async function login(page: import('@playwright/test').Page): Promise<void> {
  await page.goto('/login');
  await page.getByPlaceholder('请输入账号').fill('admin');
  await page.getByPlaceholder('请输入密码').fill('Mcc@2026');
  await page.getByRole('button', { name: '登录' }).click();
  await expect(page).toHaveURL(/\/admin$/);
}

test('多标签页：生成 / 切换 / 关闭 / 刷新保留 / 登出清空', async ({ page }) => {
  await login(page);

  const tablist = page.getByRole('tablist', { name: '页面标签' });
  await expect(tablist.getByRole('tab', { name: '首页' })).toHaveAttribute('aria-selected', 'true');

  // 打开销售单列表 → 新增标签并激活
  await page.getByRole('link', { name: '销售单', exact: true }).click();
  await expect(page).toHaveURL(/\/admin\/sale-orders$/);
  await expect(tablist.getByRole('tab', { name: '销售单' })).toHaveAttribute('aria-selected', 'true');
  await expect(tablist.getByRole('tab')).toHaveCount(2);

  // 重复进入同一路径只激活，不新增
  await page.getByRole('tab', { name: '首页' }).click();
  await expect(page).toHaveURL(/\/admin$/);
  await page.getByRole('tab', { name: '销售单' }).click();
  await expect(page).toHaveURL(/\/admin\/sale-orders$/);
  await expect(tablist.getByRole('tab')).toHaveCount(2);

  // 新建页生成独立标签（标题取页面标识）
  await page.getByRole('link', { name: '新建', exact: true }).click();
  await expect(page).toHaveURL(/\/admin\/sale-orders\/new$/);
  await expect(tablist.getByRole('tab', { name: '新建', exact: true })).toHaveAttribute(
    'aria-selected',
    'true',
  );
  await expect(tablist.getByRole('tab')).toHaveCount(3);

  // 切回列表标签
  await tablist.getByRole('tab', { name: '销售单' }).click();
  await expect(page).toHaveURL(/\/admin\/sale-orders$/);

  // 关闭当前标签（销售单）→ 跳右邻（新建）
  await page.getByRole('button', { name: '关闭 销售单' }).click();
  await expect(page).toHaveURL(/\/admin\/sale-orders\/new$/);
  await expect(tablist.getByRole('tab')).toHaveCount(2);

  // 关闭最右标签（新建）→ 跳左邻（首页）
  await page.getByRole('button', { name: '关闭 新建' }).click();
  await expect(page).toHaveURL(/\/admin$/);
  await expect(tablist.getByRole('tab')).toHaveCount(1);

  // 刷新后标签在会话内保留
  await page.getByRole('link', { name: '销售单', exact: true }).click();
  await expect(page).toHaveURL(/\/admin\/sale-orders$/);
  await page.reload();
  await expect(tablist.getByRole('tab')).toHaveCount(2);
  await expect(tablist.getByRole('tab', { name: '销售单' })).toHaveAttribute('aria-selected', 'true');

  // 退出登录后标签存储被清空
  await page.getByText('销', { exact: true }).click();
  await page.getByText('退出登录', { exact: true }).click();
  await expect(page).toHaveURL(/\/login$/);
  expect(await page.evaluate(() => window.sessionStorage.getItem('mcc.tabs.v1'))).toBeNull();
});
