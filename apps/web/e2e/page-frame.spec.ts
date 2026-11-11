import { expect, test } from '@playwright/test';
import { expectPageFrame } from './support/page-frame';

// 表单页 / 详情页共用骨架（product/平台布局.md）：
// 标题区与底部操作区固定，内容区独立滚动；详情明细区限高并内部滚动、表头固定。
test.use({ viewport: { width: 1280, height: 600 } });

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

test('表单/详情固定页头页脚，详情明细区内部滚动', async ({ page }) => {
  const customerName = `e2e-frame-${Date.now()}`;

  await page.goto('/login');
  await page.getByPlaceholder('请输入账号').fill('admin');
  await page.getByPlaceholder('请输入密码').fill('Mcc@2026');
  await page.getByRole('button', { name: '登录' }).click();
  await expect(page).toHaveURL(/\/admin$/);

  const refresh = await page.request.post('/api/v1/auth/refresh', { data: {} });
  const { accessToken } = (await refresh.json()) as { accessToken: string };
  const auth = { Authorization: `Bearer ${accessToken}` };

  const customerRes = await page.request.post('/api/v1/customers', {
    data: { name: customerName },
    headers: auth,
  });
  expect(customerRes.ok()).toBeTruthy();
  const customer = (await customerRes.json()) as { id: string };

  let orderId = '';
  try {
    const items = Array.from({ length: 30 }, () => ({
      lengthMm: 3000,
      widthMm: 100,
      heightMm: 20,
      pieces: 1,
      pricingMode: 'volume',
      price: '500.00',
      otherAmount: '0',
      note: '',
    }));
    const orderRes = await page.request.post('/api/v1/sale-orders', {
      data: {
        saleDate: new Date().toISOString().slice(0, 10),
        customerId: customer.id,
        otherAmount: '0',
        note: '',
        items,
      },
      headers: auth,
    });
    expect(orderRes.ok()).toBeTruthy();
    const order = (await orderRes.json()) as { id: string };
    orderId = order.id;

    // 表单页：标题与底部保存按钮不随内容区滚动
    await page.goto('/admin/sale-orders/new');
    const title = page.getByRole('heading', { name: '新建销售单' });
    const frameBody = page.locator('[data-slot="page-frame-body"]');
    const frameActions = page.locator('[data-slot="page-frame-actions"]');
    await expectPageFrame(page, { title: '新建销售单', actions: ['保存', '取消'] });

    const titleBefore = await title.boundingBox();
    const actionsBefore = await frameActions.boundingBox();
    await frameBody.evaluate((el) => {
      el.scrollTop = el.scrollHeight;
    });
    await expect.poll(() => frameBody.evaluate((el) => el.scrollTop)).toBeGreaterThan(0);
    expect((await title.boundingBox())?.y).toBe(titleBefore?.y);
    expect((await frameActions.boundingBox())?.y).toBe(actionsBefore?.y);

    // 页面本身不滚动，滚动只发生在内容区
    await expect
      .poll(() => page.locator('main.scroll-area').evaluate((el) => el.scrollHeight <= el.clientHeight))
      .toBe(true);
    await expect
      .poll(() =>
        page.evaluate(() => document.documentElement.scrollWidth <= document.documentElement.clientWidth),
      )
      .toBe(true);

    // 详情页：标题、操作区固定；明细表限高并内部滚动，表头 sticky
    await page.goto(`/admin/sale-orders/${orderId}`);
    await expectPageFrame(page, { title: /销售单 SO-/, actions: ['返回列表'] });

    const tableContainer = page.locator('[data-slot="table-container"]');
    await expect
      .poll(() => tableContainer.evaluate((el) => el.scrollHeight > el.clientHeight))
      .toBe(true);

    const head = page.getByRole('columnheader', { name: '编码' });
    await expect(head).toBeVisible();
    const headBefore = await head.boundingBox();
    await tableContainer.evaluate((el) => {
      el.scrollTop = el.scrollHeight;
    });
    expect((await head.boundingBox())?.y).toBe(headBefore?.y);

    // 客户表单 / 详情同样使用页面骨架（标题由页面传入，操作区固定）
    await page.goto('/admin/customers/new');
    await expectPageFrame(page, { title: '新建客户', actions: ['保存', '取消'] });

    await page.goto(`/admin/customers/${customer.id}`);
    await expectPageFrame(page, {
      title: new RegExp(customerName),
      actions: ['返回列表'],
    });
  } finally {
    if (orderId) {
      await page.request.delete(`/api/v1/sale-orders/${orderId}`, { headers: auth });
    }
    await page.request.delete(`/api/v1/customers/${customer.id}`, { headers: auth });
  }
});
