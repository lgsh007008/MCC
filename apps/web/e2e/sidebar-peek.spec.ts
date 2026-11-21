import { expect, test, type Locator, type Page } from '@playwright/test';

// 折叠态一级分组 + 当前分组悬浮层（product/平台布局.md R-平台布局-001）：
// 折叠后只显示分组（设计分组置顶），分组带图标和标题；悬停分组显示该组二级菜单。
test.use({ viewport: { width: 1280, height: 900 } });
test.setTimeout(60_000);

// dev 模式下首次点击可能早于 hydration；未折叠时补点一次，避免把环境抖动当成功能失败。
async function collapseSidebar(page: Page): Promise<void> {
  const collapse = page.getByRole('button', { name: '收起侧边栏' });
  const expand = page.getByRole('button', { name: '展开侧边栏' });
  await collapse.click();
  try {
    await expect(expand).toBeVisible({ timeout: 3_000 });
  } catch {
    await collapse.click();
    await expect(expand).toBeVisible();
  }
}

// 选中 / 打开态只用底色与字重区分，任何导航项都不渲染竖向指示条。
async function expectNoIndicatorBar(locator: Locator): Promise<void> {
  const before = await locator.evaluate((el) => {
    const style = window.getComputedStyle(el, '::before');
    return { content: style.content, width: style.width };
  });
  expect(before.content === 'none' || before.width === '0px').toBe(true);
}

test.beforeEach(async ({ page }) => {
  // 隐藏 Next 开发工具悬浮层：nextjs-portal 固定在左下角，会遮挡侧栏底部的折叠按钮
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
  await page.goto('/login');
  await page.getByPlaceholder('请输入 11 位手机号').fill('13800000001');
  await page.getByPlaceholder('请输入密码').fill('Mcc@2026');
  await page.getByRole('button', { name: '登录' }).click();
  await expect(page).toHaveURL(/\/admin\/packaging-design$/);
  await expect(page.getByRole('button', { name: '收起侧边栏' })).toBeVisible();
});

test('折叠态显示一级分组标题，悬停只显示当前分组菜单', async ({ page }) => {
  await collapseSidebar(page);
  await expect(page.getByRole('button', { name: '展开侧边栏' })).toBeVisible();

  // 静止态：一级分组有图标和标题，二级项不直接铺开；不再有独立首页入口
  await expect(page.getByRole('link', { name: '首页', exact: true })).toHaveCount(0);
  await expect(page.getByRole('button', { name: '设计', exact: true })).toBeVisible();
  for (const label of ['销售', '设计', '采购', '生产', '财务']) {
    await expect(page.getByRole('button', { name: label, exact: true })).toBeVisible();
  }
  await expect(page.getByRole('link', { name: '销售单' })).toHaveCount(0);

  // 悬停销售：只显示销售组的两项
  await page.getByRole('button', { name: '销售', exact: true }).hover();
  const salesMenu = page.getByRole('navigation', { name: '销售菜单' });
  await expect(salesMenu).toBeVisible();
  await expect(salesMenu.getByRole('link', { name: '销售单' })).toBeVisible();
  await expect(salesMenu.getByRole('link', { name: '客户档案' })).toBeVisible();

  // 切到设计：浮层内容切换为单项
  await page.getByRole('button', { name: '设计', exact: true }).hover();
  const designMenu = page.getByRole('navigation', { name: '设计菜单' });
  await expect(designMenu).toBeVisible();
  await expect(designMenu.getByRole('link', { name: '包装设计' })).toBeVisible();
  await expect(page.getByRole('navigation', { name: '销售菜单' })).toHaveCount(0);
});

test('分组浮层支持钉住、外部点击关闭与 Esc 关闭', async ({ page }) => {
  await collapseSidebar(page);
  const sales = page.getByRole('button', { name: '销售', exact: true });
  const salesMenu = page.getByRole('navigation', { name: '销售菜单' });

  // 点击钉住，鼠标离开后仍显示
  await sales.hover();
  await expect(salesMenu).toBeVisible();
  await sales.click();
  await expect(sales).toHaveAttribute('aria-expanded', 'true');
  await page.locator('main.scroll-area').hover();
  await expect(salesMenu).toBeVisible();

  // 外部点击关闭
  await page.locator('main.scroll-area').click({ position: { x: 500, y: 300 } });
  await expect(salesMenu).toHaveCount(0);

  // 再次悬停后 Esc 关闭
  await sales.hover();
  await expect(salesMenu).toBeVisible();
  await page.keyboard.press('Escape');
  await expect(salesMenu).toHaveCount(0);
});

test('展开态仍显示完整菜单树', async ({ page }) => {
  await collapseSidebar(page);
  await expect(page.getByRole('button', { name: '展开侧边栏' })).toBeVisible();
  await page.getByRole('button', { name: '展开侧边栏' }).click();

  await expect(page.getByRole('button', { name: '收起侧边栏' })).toBeVisible();
  await expect(page.getByRole('link', { name: '销售单' })).toBeVisible();
  await expect(page.getByRole('link', { name: '客户档案' })).toBeVisible();
  await expect(page.getByRole('link', { name: '库存盘点' })).toBeVisible();
});

test('头部只显示图标，选中态只用底色与字重区分', async ({ page }) => {
  const header = page.locator('[data-sidebar="header"]');
  await expect(header.getByRole('link', { name: '梅好木业' })).toHaveAttribute(
    'href',
    '/admin/packaging-design',
  );
  await expect(header.getByRole('img', { name: '梅好木业' })).toBeVisible();
  await expect(header).toHaveText(/^\s*$/);

  await collapseSidebar(page);

  const design = page.getByRole('button', { name: '设计', exact: true });
  await expectNoIndicatorBar(design);
  expect(await design.evaluate((el) => window.getComputedStyle(el).fontWeight)).toBe('600');

  // 浮层当前项：浅灰底 + 加粗，无竖条
  await page.getByRole('button', { name: '销售', exact: true }).hover();
  const salesMenu = page.getByRole('navigation', { name: '销售菜单' });
  await salesMenu.getByRole('link', { name: '销售单' }).click();
  await expect(page).toHaveURL(/\/admin\/sale-orders/);

  await page.getByRole('button', { name: '销售', exact: true }).hover();
  const active = salesMenu.getByRole('link', { name: '销售单' });
  await expect(active).toHaveAttribute('aria-current', 'page');
  await expectNoIndicatorBar(active);
  expect(await active.evaluate((el) => window.getComputedStyle(el).fontWeight)).toBe('600');
});
