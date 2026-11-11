import { expect, type Page } from '@playwright/test';

// 表单 / 详情页骨架断言（design/平台布局.md §1.5）：
// 新页面 E2E 只需传入标题与操作区文案，避免逐页复制固定标题 / 操作区断言。
export async function expectPageFrame(
  page: Page,
  options: { title: string | RegExp; actions?: Array<string | RegExp> },
): Promise<void> {
  await expect(page.getByRole('heading', { name: options.title })).toBeVisible();
  await expect(page.locator('[data-slot="page-frame-body"]')).toBeVisible();
  const actions = page.locator('[data-slot="page-frame-actions"]');
  await expect(actions).toBeVisible();
  for (const action of options.actions ?? []) {
    await expect(actions.getByText(action, { exact: true })).toBeVisible();
  }
}
