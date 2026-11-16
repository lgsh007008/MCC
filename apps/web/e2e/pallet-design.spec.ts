import { expect, test } from '@playwright/test';

// 托盘设计（product/托盘设计.md R-托盘设计-001~005）：
// 登录 → 新建 → 2D 图纸 → 3D 页签 → 改构件数量 → 保存 → 打印报告。
// 项目通过页面创建，数据经接口清理。

const projectName = `e2e托盘-${Date.now()}`;

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

test('托盘设计：新建、2D/3D、保存与打印报告', async ({ page }) => {
  await page.goto('/login');
  await page.getByPlaceholder('如 TN-00001').fill('TN-00001');
  await page.getByPlaceholder('请输入账号').fill('admin');
  await page.getByPlaceholder('请输入密码').fill('Mcc@2026');
  await page.getByRole('button', { name: '登录' }).click();
  await expect(page).toHaveURL(/\/admin$/);

  const refresh = await page.request.post('/api/v1/auth/refresh', { data: {} });
  const { accessToken } = (await refresh.json()) as { accessToken: string };
  const auth = { Authorization: `Bearer ${accessToken}` };
  let projectId = '';

  try {
    await page.goto('/admin/pallet-design');
    await expect(page.getByRole('heading', { name: '托盘设计' })).toBeVisible();
    await page.getByRole('link', { name: '新建托盘项目' }).click();
    await expect(page).toHaveURL(/\/admin\/pallet-design\/new$/);
    await expect(page.getByRole('heading', { name: '新建托盘设计' })).toBeVisible();

    // 项目名称改为唯一值，便于清理与识别
    const nameInput = page.getByLabel('项目名称');
    await nameInput.fill(projectName);

    // 默认九墩块结构：2D 三视图渲染
    await expect(page.locator('svg[aria-label="托盘工程图"]')).toBeVisible();
    await expect(page.getByText(/130 mm/).first()).toBeVisible();

    // 3D 页签：canvas 或 WebGL 回退提示二选一
    await page.getByRole('button', { name: '3D', exact: true }).click();
    await expect
      .poll(async () => {
        const canvas = await page.locator('canvas').count();
        const fallback = await page.getByText('当前浏览器不支持 WebGL，已回退到轴测图。').count();
        return canvas + fallback;
      })
      .toBeGreaterThan(0);
    await page.getByRole('button', { name: '三视图', exact: true }).click();

    // 改第一行数量 5 → 6，构件件数联动
    const quantity = page.getByLabel('第 1 行数量');
    await quantity.fill('6');
    await expect(page.getByText(/21 件构件/)).toBeVisible();

    await page.getByRole('button', { name: '保存' }).click();
    await expect(page).toHaveURL(/\/admin\/pallet-design\/[0-9a-f-]{36}$/);
    projectId = page.url().split('/').pop() ?? '';

    // 打印报告
    await page.getByRole('link', { name: '打印报告' }).click();
    await expect(page).toHaveURL(/\/report$/);
    await expect(page.getByRole('heading', { name: '托盘结构图与木材料单' })).toBeVisible();
    await expect(page.getByRole('heading', { name: '木材料单', exact: true })).toBeVisible();
    await expect(page.getByText(/本报告用于方案沟通与备料参考/)).toBeVisible();
  } finally {
    if (projectId) {
      await page.request.delete(`/api/v1/pallet/projects/${projectId}`, { headers: auth });
    } else {
      const list = await page.request.get('/api/v1/pallet/projects', {
        headers: auth,
        params: { keyword: projectName, page: 1, pageSize: 10 },
      });
      if (list.ok()) {
        const data = (await list.json()) as { items: Array<{ id: string }> };
        for (const item of data.items) {
          await page.request.delete(`/api/v1/pallet/projects/${item.id}`, { headers: auth });
        }
      }
    }
  }
});
