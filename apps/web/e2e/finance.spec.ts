import { expect, test } from '@playwright/test';

// 收支汇总冒烟（product/finance.md R-财务-001）：登录 → 财务菜单（无台账项）→ 经营收支 Tab →
// 切换资金收付 Tab（URL 写入）→ 两个 Tab 的指标卡与表格结构。
// 财务台账下线后，流水是唯一录入入口；本用例只验证汇总页聚合展示。

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

test('登录 → 收支汇总两个 Tab → 指标卡与分类表', async ({ page }) => {
  await page.goto('/login');
  await page.getByPlaceholder('请输入账号').fill('admin');
  await page.getByPlaceholder('请输入密码').fill('Mcc@2026');
  await page.getByRole('button', { name: '登录' }).click();
  await expect(page).toHaveURL(/\/admin$/);

  // 财务分组两项菜单（台账、固定资产均已下线）
  await expect(page.getByRole('link', { name: '财务台账', exact: true })).toHaveCount(0);
  await expect(page.getByRole('link', { name: '资金流水', exact: true })).toBeVisible();
  await expect(page.getByRole('link', { name: '固定资产', exact: true })).toHaveCount(0);
  await expect(page.getByRole('link', { name: '收支汇总', exact: true })).toBeVisible();

  await page.getByRole('link', { name: '收支汇总', exact: true }).click();
  await expect(page).toHaveURL(/\/admin\/finance\/summary$/);
  await expect(page.getByRole('tab', { name: '经营收支' })).toBeVisible();
  await expect(page.getByText('总收入', { exact: true })).toBeVisible();
  await expect(page.getByText('总支出', { exact: true })).toBeVisible();
  await expect(page.getByText('净额', { exact: true }).first()).toBeVisible();
  for (const label of ['销售收入', '其他收入', '采购支出', '工资', '费用']) {
    await expect(page.getByRole('cell', { name: label, exact: true })).toBeVisible();
  }
  await expect(page.getByText(/本期计入/)).toBeVisible();

  // 口径说明弹窗：三组内容 + 关闭
  await page.getByRole('button', { name: '分类口径说明' }).click();
  await expect(page.getByText('经营收支口径说明')).toBeVisible();
  await expect(page.getByText('这五个分类是什么')).toBeVisible();
  await expect(page.getByText('为什么不含其余分类')).toBeVisible();
  await page.getByRole('button', { name: '关闭', exact: true }).click();
  await expect(page.getByText('经营收支口径说明')).toHaveCount(0);

  await page.getByRole('tab', { name: '资金收付' }).click();
  await expect(page).toHaveURL(/\?tab=funds$/);
  await expect(page.getByText('期间收款', { exact: true })).toBeVisible();
  await expect(page.getByText('期间付款', { exact: true })).toBeVisible();
  await expect(page.getByText('净流入', { exact: true })).toBeVisible();
  // 四卡同排：期间三卡 + 「当前资金总额 · 此刻」（资金总额不随日期筛选变化）
  await expect(page.getByText(/当前资金总额/)).toBeVisible();

  // 资金收付口径说明弹窗：三组内容 + 关闭
  await page.getByRole('button', { name: '资金口径说明' }).click();
  await expect(page.getByText('资金收付口径说明')).toBeVisible();
  await expect(page.getByText('净流入为什么不等于资金总额')).toBeVisible();
  await expect(page.getByText('哪些钱进、哪些不进')).toBeVisible();
  await page.getByRole('button', { name: '关闭', exact: true }).click();
  await expect(page.getByText('资金收付口径说明')).toHaveCount(0);

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
