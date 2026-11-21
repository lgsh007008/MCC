import { expect, test } from '@playwright/test';

// 阶段一验收冒烟（product/账号与权限.md R-账号与权限-001、product/平台布局.md R-平台布局-001、
// product/order.md R-订单-001）：登录 → 包装设计（当前阶段默认落地页）→ 侧边菜单（设计组 / 包装设计 + 订单组 / 销售单）
// → 销售单列表 → 退出 → 未登录访问后台弹回登录页。
// 账号：seed 初始化（apps/server/scripts/seed.ts）；密码错误锁定等负面用例见 server 集成测试（test/auth.spec.ts）。

const customerName = `e2e-客户-${Date.now()}`;

// 隐藏 Next 开发工具的悬浮层：nextjs-portal 固定在左下角，会遮挡侧栏底部的折叠按钮并拦截点击（仅 dev 存在）
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

test('登录 → 包装设计 → 订单菜单 → 销售单列表 → 退出 → 未登录守卫', async ({ page }) => {
  await page.goto('/login');
  await expect(page.getByRole('heading', { name: '登录' })).toBeVisible();

  await page.getByPlaceholder('请输入 11 位手机号').fill('13800000001');
  await page.getByPlaceholder('请输入密码').fill('Mcc@2026');
  await page.getByRole('button', { name: '登录' }).click();

  // 登录成功进入包装设计（当前阶段默认落地页）
  await expect(page).toHaveURL(/\/admin\/packaging-design$/);
  await expect(page.getByPlaceholder('方案名称 / 编号 / 客户名称')).toBeVisible();
  await expect(page.getByRole('link', { name: '新建包装方案', exact: true })).toBeVisible();

  // 侧边菜单：设计组（包装设计）+ 销售组（销售单 / 客户档案），未建分组不再预置、无「待建」标注
  await expect(page.getByRole('link', { name: '包装设计', exact: true })).toBeVisible();
  await expect(page.getByRole('link', { name: '销售单', exact: true })).toBeVisible();
  await expect(page.getByRole('link', { name: '客户档案', exact: true })).toBeVisible();
  await expect(page.getByText('待建', { exact: true })).toHaveCount(0);

  // 分组树状折叠：点组标题收起子项，再点展开
  await page.getByRole('button', { name: '销售', exact: true }).click();
  await expect(page.getByRole('link', { name: '销售单', exact: true })).toHaveCount(0);
  await page.getByRole('button', { name: '销售', exact: true }).click();
  await expect(page.getByRole('link', { name: '销售单', exact: true })).toBeVisible();

  // 边栏折叠后点击菜单不自动展开（sidebar_state cookie 保持 false）
  const sidebarState = async (): Promise<string | undefined> =>
    (await page.context().cookies()).find((cookie) => cookie.name === 'sidebar_state')?.value;
  await page.getByRole('button', { name: '收起侧边栏' }).click();
  await expect.poll(sidebarState).toBe('false');
  await page.getByRole('button', { name: '销售', exact: true }).hover();
  await page
    .getByRole('navigation', { name: '销售菜单' })
    .getByRole('link', { name: '销售单', exact: true })
    .click();
  await expect(page).toHaveURL(/\/admin\/sale-orders$/);
  await expect.poll(sidebarState).toBe('false');
  // 恢复展开，继续后续流程
  await page.getByRole('button', { name: '展开侧边栏' }).click();
  await expect(page.getByRole('link', { name: '新建', exact: true })).toBeVisible();
  await expect(page.getByRole('columnheader', { name: '编号' })).toBeVisible();
  // 固定合计行（列表页表格底部，汇总标签在编号列）
  await expect(page.getByRole('cell', { name: '合计', exact: true })).toBeVisible();

  // 新建客户：保存后进详情，页面展示客户编号
  await page.goto('/admin/customers/new');
  await page.getByPlaceholder('客户名称').fill(customerName);
  await page.getByRole('button', { name: '保存' }).click();
  await expect(page).toHaveURL(/\/admin\/customers\/[0-9a-f-]{36}$/);
  await expect(page.getByText(/^CT-\d{5}$/)).toBeVisible();

  // 新建页：明细区行操作「复制行」可用（1 → 2 行）；页面标题 =「新建销售单」
  await page.goto('/admin/sale-orders/new');
  await expect(page.getByText('共 1 / 200 行')).toBeVisible();
  await page.getByRole('button', { name: '复制行' }).first().click();
  await expect(page.getByText('共 2 / 200 行')).toBeVisible();
  await expect(page.getByRole('heading', { name: '新建销售单' })).toBeVisible();

  // 填写并保存 → 详情页标题 = 单号；编辑页标题 =「编辑销售单」
  await page.getByRole('button', { name: '删除行' }).last().click();
  await expect(page.getByText('共 1 / 200 行')).toBeVisible();
  // 客户下拉：应用内下拉（非原生 select），点触发器后选上一步新建的客户
  await page.getByLabel('客户', { exact: true }).click();
  await page.getByRole('option', { name: customerName }).click();
  // 明细行按单元格定位：长度 / 宽度 / 高度 / 根数 / 单价
  const row = page.locator('tbody tr').first();
  const cellInput = (index: number): ReturnType<typeof row.locator> =>
    row.locator('td').nth(index).locator('input');
  await cellInput(0).fill('3000');
  await cellInput(1).fill('100');
  await cellInput(2).fill('20');
  await cellInput(3).fill('10');
  await cellInput(6).fill('600.00');
  await page.getByRole('button', { name: '保存' }).click();
  // 干净库首次开单时尚无方木产出，保存会先弹「成本待补」确认
  // （product/生产与库存.md R-生产-004）；已有产出成本时不会出现
  const materialCostDialog = page.getByRole('alertdialog', { name: '当前无有效方木成本' });
  await materialCostDialog
    .waitFor({ state: 'visible', timeout: 2000 })
    .catch(() => undefined);
  if (await materialCostDialog.isVisible()) {
    await materialCostDialog.getByRole('button', { name: '仍然保存' }).click();
  }

  await expect(page).toHaveURL(/\/admin\/sale-orders\/[0-9a-f-]{36}$/);
  await expect(
    page.getByRole('heading', { name: /销售单 SO-\d{5}/ }),
  ).toBeVisible();

  // 打印预览：弹窗打开、A4 模板内容可见、ESC 关闭（product/order.md R-订单-002）
  await page.getByRole('button', { name: '打印', exact: true }).click();
  const printDialog = page.getByTestId('print-preview-dialog');
  await expect(printDialog).toBeVisible();
  await expect(printDialog.getByTestId('sale-order-print')).toBeVisible();
  await expect(printDialog.getByText('成品销售单')).toBeVisible();
  await expect(printDialog.getByText(customerName)).toBeVisible();
  await expect(printDialog.getByText(/合计金额/)).toBeVisible();
  await expect(printDialog.getByTestId('sale-order-signature')).toContainText('客户');
  await expect(printDialog.getByText('制单')).toHaveCount(0);
  await expect(printDialog.getByText('司机')).toHaveCount(0);
  await page.keyboard.press('Escape');
  await expect(printDialog).toHaveCount(0);

  await page.getByRole('link', { name: '编辑' }).click();
  await expect(page).toHaveURL(/\/edit$/);
  await expect(page.getByRole('heading', { name: /编辑销售单/ })).toBeVisible();

  // 客户批量启停用：应用内确认弹窗（非浏览器原生）→ 状态变更 → 再批量启用恢复
  await page.goto('/admin/customers');
  const customerRow = page.getByRole('row').filter({ hasText: customerName });
  const confirmDialog = page.getByRole('alertdialog');
  await customerRow.getByRole('checkbox').check();
  await page.getByRole('button', { name: '批量停用' }).click();
  await expect(confirmDialog).toBeVisible();
  await expect(confirmDialog.getByText(/1 个将停用/)).toBeVisible();
  await confirmDialog.getByRole('button', { name: '停用', exact: true }).click();
  await expect(customerRow.getByText('停用', { exact: true })).toBeVisible();

  await customerRow.getByRole('checkbox').check();
  await page.getByRole('button', { name: '批量启用' }).click();
  await expect(confirmDialog).toBeVisible();
  await confirmDialog.getByRole('button', { name: '启用', exact: true }).click();
  await expect(customerRow.getByText('启用', { exact: true })).toBeVisible();

  // 批量删除：确认文案含销售单数量，删除后行消失（历史订单不受影响）
  await customerRow.getByRole('checkbox').check();
  await page.getByRole('button', { name: '批量删除' }).click();
  await expect(confirmDialog.getByText(/共 1 张销售单/)).toBeVisible();
  await confirmDialog.getByRole('button', { name: '删除', exact: true }).click();
  await expect(customerRow).toHaveCount(0);

  // 页面级无横向滚动：1440 与 1024 两档宽度（全站硬约束）
  for (const width of [1440, 1024]) {
    await page.setViewportSize({ width, height: 900 });
    await expect
      .poll(() =>
        page.evaluate(
          () => document.documentElement.scrollWidth <= document.documentElement.clientWidth,
        ),
      )
      .toBe(true);
  }

  // 管理员头像菜单：账号管理入口可见；账号页可访问（R-账号与权限-002）
  await page.getByText('销', { exact: true }).click();
  await page.getByText('账号管理', { exact: true }).click();
  await expect(page).toHaveURL(/\/admin\/users$/);
  await expect(page.getByRole('columnheader', { name: '姓名' })).toBeVisible();
  await expect(page.getByRole('cell', { name: 'admin', exact: true })).toBeVisible();

  // 列表页模式：姓名/手机号筛选 + 分页总数
  await page.getByPlaceholder('姓名或手机号模糊').fill('admin');
  await page.getByRole('button', { name: '查询', exact: true }).click();
  await expect(page.getByRole('cell', { name: 'admin', exact: true })).toBeVisible();
  await expect(page.getByText(/第 1 \/ \d+ 页 · 共 \d+ 条/)).toBeVisible();

  // 角色权限说明：只读弹窗展示四角色矩阵与端权限说明
  await page.getByRole('button', { name: '角色权限说明' }).click();
  const permissionsDialog = page.getByTestId('role-permissions-dialog');
  await expect(permissionsDialog).toBeVisible();
  await expect(permissionsDialog.getByText('管理员', { exact: true })).toBeVisible();
  await expect(permissionsDialog.getByText('工人', { exact: true })).toBeVisible();
  await expect(permissionsDialog.getByText(/PC 与手机端共用同一套权限/)).toBeVisible();
  await permissionsDialog.getByRole('button', { name: '关闭' }).click();
  await expect(permissionsDialog).toHaveCount(0);

  // 退出登录 → 回登录页
  await page.getByText('销', { exact: true }).click();
  await page.getByText('退出登录', { exact: true }).click();
  await expect(page).toHaveURL(/\/login$/);

  // 未登录直接访问后台 → 弹回登录页
  await page.goto('/admin/sale-orders');
  await expect(page).toHaveURL(/\/login$/);
});