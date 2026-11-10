import { expect, test } from '@playwright/test';

// 财务台账冒烟（product/finance.md R-财务-001）：登录 → 财务菜单 → 弹窗新建（含未保存取消拦截）→
// 弹窗编辑 → 详情（面包屑编号 / 有符号金额）→ 收支汇总（分类小计）→ 列表删除 → 行消失。
// 弹窗表单规范见 product/平台布局.md（字段少的表单走弹窗，不跳独立页面）。

// 隐藏 Next 开发工具的悬浮层（同 login.spec，避免遮挡点击）
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

test('登录 → 财务台账 → 弹窗新建 / 编辑 → 汇总 → 删除', async ({ page }) => {
  // 备注带时间戳，避免与历史运行残留冲突
  const noteText = `e2e 弹窗维修-${Date.now()}`;
  await page.goto('/login');
  await page.getByPlaceholder('请输入账号').fill('admin');
  await page.getByPlaceholder('请输入密码').fill('Mcc@2026');
  await page.getByRole('button', { name: '登录' }).click();
  await expect(page).toHaveURL(/\/admin$/);

  // 财务分组两个菜单项
  await expect(page.getByRole('link', { name: '财务台账', exact: true })).toBeVisible();
  await expect(page.getByRole('link', { name: '收支汇总', exact: true })).toBeVisible();
  await page.getByRole('link', { name: '财务台账', exact: true }).click();
  await expect(page).toHaveURL(/\/admin\/finance\/events$/);
  await expect(page.getByRole('columnheader', { name: '发生日期' })).toBeVisible();
  await expect(page.getByRole('cell', { name: '合计', exact: true })).toBeVisible();

  const formDialog = page.getByRole('dialog');
  const confirmDialog = page.getByRole('alertdialog');

  // 弹窗新建（默认分类其他支出、日期今天）
  await page.getByRole('button', { name: '新建', exact: true }).click();
  await expect(formDialog.getByText('新建财务事件')).toBeVisible();
  await formDialog.getByPlaceholder('0.00').fill('100.50');
  await formDialog.getByPlaceholder(/具体事由/).fill(noteText);
  await formDialog.getByRole('button', { name: '保存' }).click();
  await expect(formDialog).toHaveCount(0);

  const eventRow = page.getByRole('row').filter({ hasText: noteText });
  await expect(eventRow).toBeVisible();
  await expect(eventRow).toContainText('-100.50');

  // 有未保存改动时取消 → 二次确认 → 放弃录入（不产生新事件）
  await page.getByRole('button', { name: '新建', exact: true }).click();
  await formDialog.getByPlaceholder('0.00').fill('55.00');
  await formDialog.getByRole('button', { name: '取消' }).click();
  await expect(confirmDialog).toBeVisible();
  await expect(confirmDialog.getByText('放弃录入')).toBeVisible();
  await confirmDialog.getByRole('button', { name: '放弃', exact: true }).click();
  await expect(formDialog).toHaveCount(0);
  await expect(page.getByRole('row').filter({ hasText: '55.00' })).toHaveCount(0);

  // 弹窗编辑：金额按分类保持负号
  await eventRow.getByRole('button', { name: '编辑' }).click();
  await expect(formDialog.getByText('编辑财务事件')).toBeVisible();
  await formDialog.getByPlaceholder('0.00').fill('120.00');
  await formDialog.getByRole('button', { name: '保存' }).click();
  await expect(formDialog).toHaveCount(0);
  await expect(eventRow).toContainText('-120.00');

  // 详情弹窗：点编号打开（只读），信息条含金额与来源；详情 → 编辑为状态切换
  await eventRow.getByRole('button', { name: /^FN-\d{5}$/ }).click();
  await expect(formDialog.getByText(/^FN-\d{5}（其他支出）$/)).toBeVisible();
  await expect(formDialog.getByText('-120.00', { exact: true })).toBeVisible();
  await expect(formDialog.getByText('手工', { exact: true })).toBeVisible();
  await formDialog.getByRole('button', { name: '编辑', exact: true }).click();
  await expect(formDialog.getByText('编辑财务事件')).toBeVisible();
  await formDialog.getByRole('button', { name: '取消' }).click();
  await expect(formDialog).toHaveCount(0);

  // 收支汇总：指标卡 + 分类小计（五类固定输出；金额受库内其他数据影响，此处只校验结构）
  await page.getByRole('link', { name: '收支汇总', exact: true }).click();
  await expect(page).toHaveURL(/\/admin\/finance\/summary$/);
  await expect(page.getByText('总收入', { exact: true })).toBeVisible();
  await expect(page.getByText('总成本', { exact: true })).toBeVisible();
  await expect(page.getByText('净利润', { exact: true })).toBeVisible();
  await expect(page.getByRole('row').filter({ hasText: '其他支出' })).toBeVisible();
  await expect(page.getByRole('row').filter({ hasText: '销售收入' })).toBeVisible();

  // 回台账删除（应用内确认弹窗）
  await page.getByRole('link', { name: '财务台账', exact: true }).click();
  const rowToDelete = page.getByRole('row').filter({ hasText: noteText });
  await expect(rowToDelete).toBeVisible();
  await rowToDelete.getByRole('button', { name: '删除' }).click();
  await expect(confirmDialog).toBeVisible();
  await confirmDialog.getByRole('button', { name: '删除', exact: true }).click();
  await expect(page.getByRole('row').filter({ hasText: noteText })).toHaveCount(0);

  // 全站无页面级横向滚动（硬约束）
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
});
