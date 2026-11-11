import { expect, test } from '@playwright/test';

// 客户档案移动端冒烟（product/customer.md 移动页；ADR-011）：
// 手机登录 → 客户档案 → 新建 → 编辑 → 停用/启用 → 删除 → 搜索确认消失。
// 列表与销售单共用 components/mobile/list.tsx（搜索框 / 卡片 / 加载更多）。
test.use({ viewport: { width: 390, height: 844 } });

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

test('手机端客户档案：新建 → 编辑 → 停用/启用 → 删除', async ({ page }) => {
  const customerName = `e2e 手机客户档案-${Date.now()}`;

  await page.goto('/login');
  await page.getByPlaceholder('请输入账号').fill('admin');
  await page.getByPlaceholder('请输入密码').fill('Mcc@2026');
  await page.getByRole('button', { name: '登录' }).click();
  await expect(page).toHaveURL(/\/m$/);

  await page.getByRole('link', { name: /客户档案/ }).click();
  await expect(page).toHaveURL(/\/m\/customers$/);

  // 新建（顶部栏右侧动作）
  await page.getByRole('link', { name: '新建客户' }).click();
  await expect(page).toHaveURL(/\/m\/customers\/new$/);
  await page.getByLabel('客户名称').fill(customerName);
  await page.getByLabel('联系信息').fill('13800000000');
  await page.getByRole('button', { name: '保存' }).click();
  await expect(page).toHaveURL(/\/m\/customers\/[0-9a-f-]{36}$/);
  await expect(page.getByText(customerName)).toBeVisible();

  // 编辑
  await page.getByRole('link', { name: '编辑' }).click();
  await expect(page).toHaveURL(/\/edit$/);
  await page.getByLabel('联系信息').fill('13900000000');
  await page.getByRole('button', { name: '保存' }).click();
  await expect(page).toHaveURL(/\/m\/customers\/[0-9a-f-]{36}$/);
  await expect(page.getByText('13900000000')).toBeVisible();

  // 停用（确认）→ 启用（直接）
  await page.getByRole('button', { name: '停用客户' }).click();
  const confirmDialog = page.getByRole('alertdialog');
  await expect(confirmDialog).toBeVisible();
  await confirmDialog.getByRole('button', { name: '停用', exact: true }).click();
  await expect(page.getByText('停用', { exact: true })).toBeVisible();
  await page.getByRole('button', { name: '启用客户' }).click();
  await expect(page.getByText('启用', { exact: true })).toBeVisible();

  // 删除（确认文案含销售单数量）→ 回列表 → 搜索确认消失
  await page.getByRole('button', { name: '删除客户' }).click();
  await expect(confirmDialog).toBeVisible();
  await expect(confirmDialog.getByText(/0 张销售单/)).toBeVisible();
  await confirmDialog.getByRole('button', { name: '删除', exact: true }).click();
  await expect(page).toHaveURL(/\/m\/customers$/);

  const search = page.getByPlaceholder('搜索客户名称');
  await search.fill(customerName);
  await search.press('Enter');
  await expect(page.getByText('暂无客户')).toBeVisible();

  // 移动页无横向滚动（全站硬约束）
  const overflow = await page.evaluate(
    () => document.documentElement.scrollWidth - document.documentElement.clientWidth,
  );
  expect(overflow).toBeLessThanOrEqual(0);
});
