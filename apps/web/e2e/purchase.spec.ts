import { expect, test } from '@playwright/test';

// 采购与供应商冒烟（product/purchase.md / product/supplier.md）：
// API 预置供应商与采购单，验证 PC 列表 / 详情金额与移动入口；
// 结束后经 API 删除，避免污染后续用例。

test('采购单：列表与详情展示金额，移动入口可达', async ({ page, request }) => {
  const login = await request.post('/api/v1/auth/login', {
    data: { username: 'admin', password: 'Mcc@2026', rememberMe: false },
  });
  expect(login.ok()).toBeTruthy();
  const token = (await login.json()).accessToken as string;
  const headers = { Authorization: `Bearer ${token}` };

  const supplierName = `e2e 采购供应商-${Date.now()}`;
  const supplier = await request.post('/api/v1/suppliers', {
    headers,
    data: { name: supplierName, contact: '13800000000', openingPayable: '0.00', note: '' },
  });
  expect(supplier.status()).toBe(201);
  const supplierId = (await supplier.json()).id as string;

  const order = await request.post('/api/v1/purchase-orders', {
    headers,
    data: {
      supplierId,
      purchaseDate: '2030-04-02',
      deliveredTons: '1.500',
      settledTons: '1.000',
      unitPrice: '100.00',
      otherAmount: '20.00',
      settlementMode: 'credit',
      note: 'e2e',
    },
  });
  expect(order.status()).toBe(201);
  const orderBody = await order.json();
  expect(orderBody.totalAmount).toBe('120.00');
  const orderId = orderBody.id as string;

  try {
    // PC 登录 → 采购单列表 → 详情
    await page.goto('/login');
    await page.getByPlaceholder('请输入账号').fill('admin');
    await page.getByPlaceholder('请输入密码').fill('Mcc@2026');
    await page.getByRole('button', { name: '登录' }).click();
    await expect(page).toHaveURL(/\/admin/);

    await page.goto('/admin/purchases');
    await expect(page.getByText(supplierName).first()).toBeVisible();
    await expect(page.getByText('120.00').first()).toBeVisible();
    // 列表：日期筛选为应用内日期选择器（无原生 date 输入）；采购日期 / 合计金额表头可排序
    await expect(page.locator('input[type="date"]')).toHaveCount(0);
    await expect(page.getByRole('button', { name: '采购日期' })).toBeVisible();
    await expect(page.getByRole('button', { name: '合计金额' })).toBeVisible();
    await page.getByRole('button', { name: '合计金额' }).click();
    await expect(page.getByText('120.00').first()).toBeVisible();

    // 多选：选中一行出现批量删除按钮，取消后按钮消失
    const rowCheckbox = page.locator('tbody').getByRole('checkbox').first();
    await rowCheckbox.check();
    await expect(page.getByRole('button', { name: /批量删除/ })).toBeVisible();
    await rowCheckbox.uncheck();
    await expect(page.getByRole('button', { name: /批量删除/ })).toHaveCount(0);

    // 筛选区：供应商与结算方式同宽（均为 w-40）
    const filterBoxes = page.locator('form').first().getByRole('combobox');
    await expect(filterBoxes).toHaveCount(2);
    const supplierFilterBox = await filterBoxes.nth(0).boundingBox();
    const settlementFilterBox = await filterBoxes.nth(1).boundingBox();
    expect(
      Math.abs((supplierFilterBox?.width ?? 0) - (settlementFilterBox?.width ?? 0)),
    ).toBeLessThanOrEqual(1);

    await page.goto(`/admin/purchases/${orderId}`);
    await expect(page.getByText('合计金额')).toBeVisible();
    await expect(page.getByText('120.00')).toBeVisible();
    // 详情两卡：主信息卡含备注，吨数与金额独立成卡
    await expect(page.getByText('备注：e2e')).toBeVisible();
    await expect(page.getByRole('heading', { name: '吨数与金额' })).toBeVisible();

    // 表单：控件固定宽度与销售单一致（日期与结算方式同为窄宽，供应商更宽），无原生 date 输入
    await page.goto(`/admin/purchases/${orderId}/edit`);
    await expect(page.getByText(/编辑采购单/).first()).toBeVisible();
    await expect(page.locator('input[type="date"]')).toHaveCount(0);
    const supplierBox = await page.locator('#purchaseSupplier').boundingBox();
    const dateBox = await page.locator('#purchaseDate').boundingBox();
    const settlementBox = await page.locator('#settlementMode').boundingBox();
    expect(supplierBox).not.toBeNull();
    expect(dateBox).not.toBeNull();
    expect(settlementBox).not.toBeNull();
    expect(Math.abs((dateBox?.width ?? 0) - (settlementBox?.width ?? 0))).toBeLessThanOrEqual(1);
    expect(supplierBox?.width ?? 0).toBeGreaterThan(dateBox?.width ?? 0);

    // 供应商列表：创建日期表头可切换正 / 倒序
    await page.goto('/admin/suppliers');
    const createdHead = page.getByRole('button', { name: '创建日期' });
    await expect(createdHead).toBeVisible();
    await createdHead.click();
    await expect(page.getByText(supplierName).first()).toBeVisible();

    // 移动入口：/m → 采购 → 采购单 / 供应商两张整卡
    await page.setViewportSize({ width: 390, height: 844 });
    await page.goto('/m');
    await page.getByRole('link', { name: /采购/ }).click();
    await expect(page).toHaveURL(/\/m\/purchase$/);
    await expect(page.getByRole('link', { name: /采购单/ })).toBeVisible();
    await expect(page.getByRole('link', { name: /供应商/ })).toBeVisible();

    // 移动采购列表：供应商名称模糊搜索（回车查询、清除）
    await page.getByRole('link', { name: /采购单/ }).click();
    await expect(page).toHaveURL(/\/m\/purchase\/orders$/);
    const purchaseSearch = page.getByPlaceholder('搜索供应商名称');
    await expect(purchaseSearch).toBeVisible();
    await purchaseSearch.fill(supplierName);
    await purchaseSearch.press('Enter');
    await expect(page.getByText(supplierName).first()).toBeVisible();
    await purchaseSearch.fill(`不存在-${Date.now()}`);
    await purchaseSearch.press('Enter');
    await expect(page.getByText('暂无采购单')).toBeVisible();
    await page.getByRole('button', { name: '清除搜索' }).click();
    await expect(page.getByText(supplierName).first()).toBeVisible();

    // 移动采购详情：固定标题 + 「吨数与金额」分区 + 内容区删除
    await page.getByText(supplierName).first().click();
    await expect(page).toHaveURL(new RegExp(`/m/purchase/orders/${orderId}$`));
    await expect(page.getByRole('heading', { name: '采购单详情' })).toBeVisible();
    await expect(page.getByRole('heading', { name: '吨数与金额' })).toBeVisible();
    await expect(page.getByText('备注', { exact: true })).toBeVisible();
    await expect(page.getByRole('button', { name: '删除采购单' })).toBeVisible();

    // 移动供应商详情：固定标题 + 状态标签 + 启停用 / 删除入口
    await page.goto('/m/purchase/suppliers');
    await page.getByText(supplierName).first().click();
    await expect(page.getByRole('heading', { name: '供应商详情' })).toBeVisible();
    await expect(page.getByText('启用', { exact: true })).toBeVisible();
    await expect(page.getByRole('button', { name: '停用供应商' })).toBeVisible();
    await expect(page.getByRole('button', { name: '删除供应商' })).toBeVisible();
  } finally {
    await request.delete(`/api/v1/purchase-orders/${orderId}`, { headers });
    await request.delete(`/api/v1/suppliers/${supplierId}`, { headers });
  }
});
