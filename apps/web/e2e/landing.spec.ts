import { expect, test } from '@playwright/test';

// 公开落地页（product/落地页.md R-落地页-001 / 002 / 003 / 004）：
// `/` 不被重定向；首屏舞台可换结构；画廊联动工作台；调参、全屏、3D 与手机编排可用。

test('落地页：首屏舞台 → 画廊联动 → 调参 → 全屏 → 注册入口', async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.goto('/');
  expect(new URL(page.url()).pathname).toBe('/');
  await expect(page.getByRole('heading', { name: /把包装方案/ })).toBeVisible();

  // 首屏舞台：模板胶囊当场切换，尺寸标注同步
  const heroStage = page.getByTestId('hero-stage');
  await expect(heroStage).toBeVisible();
  await expect(heroStage.getByText(/1200 × 800/).first()).toBeVisible();
  await heroStage.getByRole('button', { name: '三纵梁两向进叉', exact: true }).click();
  await expect(heroStage.getByText(/1100 × 1100/).first()).toBeVisible();

  // 桌面首屏进入视口后加载 3D；WebGL 不可用时回退文案
  await expect
    .poll(
      async () =>
        (await heroStage.locator('canvas').count()) +
        (await heroStage.getByText('当前浏览器不支持 3D', { exact: false }).count()),
    )
    .toBeGreaterThan(0);

  // 模板画廊：点击后带入下方迷你工作台并滚到工作台
  await page.locator('#workbench').scrollIntoViewIfNeeded();
  await page.getByTestId('gallery-notched').click();
  const demo = page.locator('#workbench-demo');
  await expect(demo.getByText(/1100 × 1100/).first()).toBeVisible();

  // 调宽度：右侧参数与外形尺寸同步
  await demo.getByLabel('宽度').fill('1000');
  await expect(demo.getByText(/1100 × 1000/).first()).toBeVisible();

  // 构件清单随尺寸同源输出
  await expect(demo.getByTestId('demo-bom')).toContainText('构件清单');
  await expect(demo.getByTestId('demo-bom').locator('tbody tr').first()).toBeVisible();

  // 工作台 3D：加载 canvas 或回退
  await expect
    .poll(
      async () =>
        (await demo.locator('canvas').count()) +
        (await demo.getByText('当前浏览器不支持 3D', { exact: false }).count()),
    )
    .toBeGreaterThan(0);

  // 全屏体验：同一份状态放大，调参同步，ESC 关闭
  await demo.getByRole('button', { name: '全屏体验' }).click();
  const dialog = page.getByRole('dialog');
  await expect(dialog).toBeVisible();
  await expect(dialog.getByTestId('fullscreen-stage')).toBeVisible();
  await dialog.getByLabel('宽度').fill('900');
  await expect(dialog.getByText(/1100 × 900/).first()).toBeVisible();
  await page.keyboard.press('Escape');
  await expect(dialog).toHaveCount(0);

  // 注册入口
  await page.getByRole('link', { name: '免费注册', exact: true }).first().click();
  await expect(page).toHaveURL(/\/register$/);
});

test('落地页：手机端底部 CTA、首屏看 3D、工作台与无横向滚动', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto('/');
  await expect(page.getByRole('heading', { name: /把包装方案/ })).toBeVisible();

  // 手机端固定注册条
  await expect(page.getByRole('link', { name: '免费注册企业' })).toBeVisible();

  // 首屏舞台：先出静态轴测，点击「看 3D」再加载
  const heroStage = page.getByTestId('hero-stage');
  await heroStage.scrollIntoViewIfNeeded();
  await heroStage.getByRole('button', { name: '看 3D' }).click();
  await expect
    .poll(
      async () =>
        (await heroStage.locator('canvas').count()) +
        (await heroStage.getByText('当前浏览器不支持 3D', { exact: false }).count()),
    )
    .toBeGreaterThan(0);

  // 工作台：手机点击 3D 视图再加载
  await page.locator('#workbench-demo').scrollIntoViewIfNeeded();
  await page.locator('#workbench-demo').getByRole('tab', { name: '3D 视图' }).click();
  await expect
    .poll(
      async () =>
        (await page.locator('#workbench-demo canvas').count()) +
        (await page.getByText('当前浏览器不支持 3D', { exact: false }).count()),
    )
    .toBeGreaterThan(0);

  // 页面级无横向滚动
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= document.documentElement.clientWidth,
    ),
  ).toBe(true);
});

test('落地页：减弱动效时舞台不自动旋转，内容直接可见', async ({ page }) => {
  await page.setViewportSize({ width: 1280, height: 900 });
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await page.goto('/');

  await expect(page.getByTestId('hero-stage')).toHaveAttribute('data-auto-rotate', 'false');
  await expect(page.getByRole('heading', { name: /把包装方案/ })).toBeVisible();

  await page.locator('#features').scrollIntoViewIfNeeded();
  await expect(page.getByRole('heading', { name: /围绕木质包装/ })).toBeVisible();
});
