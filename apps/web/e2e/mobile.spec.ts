import { expect, test } from '@playwright/test';

// 移动 Web 冒烟（product/平台布局.md「移动页」；ADR-011）：
// 手机视口登录 → 自动分流 /m → 移动入口 → 销售单卡片列表 → 手机开单（单列大控件）→ 详情 → 返回列表。
// 与 PC 共用同一套 API；不新增后端接口。
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

test('手机登录 → 移动入口 → 开单 → 详情 → 列表', async ({ page }) => {
  const customerName = `e2e 手机客户-${Date.now()}`;

  await page.goto('/login');
  await page.getByPlaceholder('请输入账号').fill('admin');
  await page.getByPlaceholder('请输入密码').fill('Mcc@2026');
  await page.getByRole('button', { name: '登录' }).click();

  // 窄屏登录后自动分流到移动入口（product/平台布局.md 使用端）
  await expect(page).toHaveURL(/\/m$/);
  await expect(page.getByRole('heading', { name: '手机开单' })).toBeVisible();

  // 造一位启用客户（与 PC 共用同一接口；测试结束软删除）
  const refresh = await page.request.post('/api/v1/auth/refresh', { data: {} });
  const { accessToken } = (await refresh.json()) as { accessToken: string };
  const created = await page.request.post('/api/v1/customers', {
    data: { name: customerName },
    headers: { Authorization: `Bearer ${accessToken}` },
  });
  expect(created.ok()).toBeTruthy();
  const customer = (await created.json()) as { id: string };

  // 现结需要一个启用账户（测试结束软删）
  const accountName = `e2e 资金账户-${Date.now()}`;
  const accountRes = await page.request.post('/api/v1/finance/accounts', {
    data: {
      name: accountName,
      kind: 'corporate',
      channel: 'bank',
      openingBalance: '0.00',
      active: true,
    },
    headers: { Authorization: `Bearer ${accessToken}` },
  });
  expect(accountRes.ok()).toBeTruthy();
  const account = (await accountRes.json()) as { id: string };

  try {
    // 移动入口 → 销售二级入口 → 销售单卡片列表
    await page.getByRole('link', { name: /销售/ }).click();
    await expect(page).toHaveURL(/\/m\/sales$/);
    await page.getByRole('link', { name: /销售单/ }).click();
    await expect(page).toHaveURL(/\/m\/sale-orders$/);
    await expect(page.getByRole('heading', { name: '成品销售单' })).toBeVisible();
    // 移动端不展示单据编号（product/order.md 移动页）
    await expect(page.getByText(/SO-\d{5}/)).toHaveCount(0);

    // 新建：单列表单 + 明细行卡片
    await page.getByRole('link', { name: '新建销售单' }).click();
    await expect(page).toHaveURL(/\/m\/sale-orders\/new$/);

    await page.getByLabel('客户', { exact: true }).click();
    await page.getByRole('option', { name: customerName }).click();

    const row = page.getByRole('group', { name: '第 1 行' });
    await row.getByLabel('长度(mm)').fill('3000');
    await row.getByLabel('宽度(mm)').fill('100');
    await row.getByLabel('高度(mm)').fill('20');
    await row.getByLabel('根数').fill('10');
    await row.getByLabel('单价').fill('600.00');

    // 结算方式：切现结 → 选账户 → 实收 35.00（合计 36.00 → 抹零 1.00）
    await page.getByRole('radio', { name: '现结' }).click();
    await page.getByLabel('收款账户').click();
    await page.getByRole('option', { name: accountName }).click();
    await page.getByLabel('实收金额（元）').fill('35.00');
    await expect(page.getByText('抹零 1.00 元')).toBeVisible();

    await page.getByRole('button', { name: '保存' }).click();
    await expect(page).toHaveURL(/\/m\/sale-orders\/[0-9a-f-]{36}$/);
    await expect(page.getByText('合计金额')).toBeVisible();
    await expect(page.getByText(customerName)).toBeVisible();
    await expect(page.getByText(/SO-\d{5}/)).toHaveCount(0);
    // 详情展示结算方式与实收、抹零差额
    await expect(page.getByText('结算方式', { exact: true })).toBeVisible();
    await expect(page.getByText(new RegExp(`现结 · ${accountName}`))).toBeVisible();
    await expect(page.getByText(/实收 35\.00 元（抹零 1\.00 元）/)).toBeVisible();

    // 返回列表：新建的单据以卡片出现
    await page.getByRole('link', { name: '返回列表' }).click();
    await expect(page).toHaveURL(/\/m\/sale-orders$/);
    await expect(page.getByText(customerName).first()).toBeVisible();

    // 列表搜索：按客户名称模糊，回车即查；空结果提示；清除后回全量
    const search = page.getByPlaceholder('搜索客户名称');
    await search.fill(customerName);
    await search.press('Enter');
    await expect(page.getByText(customerName)).toHaveCount(1);
    await search.fill(`不存在-${Date.now()}`);
    await search.press('Enter');
    await expect(page.getByText('暂无销售单')).toBeVisible();
    await page.getByRole('button', { name: '清除搜索' }).click();
    await expect(page.getByText(customerName)).toBeVisible();

    // 移动页无横向滚动（全站硬约束）
    const overflow = await page.evaluate(
      () => document.documentElement.scrollWidth - document.documentElement.clientWidth,
    );
    expect(overflow).toBeLessThanOrEqual(0);

    // 详情删除：单条 + 二次确认 → 回列表且卡片消失
    await page.getByText(customerName).first().click();
    await expect(page.getByRole('heading', { name: '销售单详情' })).toBeVisible();
    await page.getByRole('button', { name: '删除销售单' }).click();
    const confirmDialog = page.getByRole('alertdialog');
    await expect(confirmDialog).toBeVisible();
    await confirmDialog.getByRole('button', { name: '删除', exact: true }).click();
    await expect(page).toHaveURL(/\/m\/sale-orders$/);
    await expect(page.getByText(customerName)).toHaveCount(0);
  } finally {
    await page.request.delete(`/api/v1/customers/${customer.id}`, {
      headers: { Authorization: `Bearer ${accessToken}` },
    });
    await page.request.delete(`/api/v1/finance/accounts/${account.id}`, {
      headers: { Authorization: `Bearer ${accessToken}` },
    });
  }

  // 退出登录：入口页标题行右侧（product/平台布局.md 移动页）
  await page.goto('/m');
  await page.getByRole('button', { name: '退出登录' }).click();
  await expect(page).toHaveURL(/\/login$/);
});

// 字号与控件角色（product/平台布局.md「字号与控件角色」；design/平台布局.md §1.8）：
// 断言绑定 tokens 变量而非像素——代表元素的 computed 值必须等于根元素上的角色变量，
// 整体调整 tokens 时测试自动跟随；页面若另写一套字号会在此失败。
test('移动字号与控件尺寸取自 tokens 角色', async ({ page }) => {
  await page.goto('/login');
  await page.getByPlaceholder('请输入账号').fill('admin');
  await page.getByPlaceholder('请输入密码').fill('Mcc@2026');
  await page.getByRole('button', { name: '登录' }).click();
  await expect(page).toHaveURL(/\/m$/);

  const roleVar = async (name: string): Promise<string> =>
    page.evaluate((variable) => {
      const root = document.querySelector('[data-mode="mobile"]');
      return root ? getComputedStyle(root).getPropertyValue(variable).trim() : '';
    }, name);

  const body = await roleVar('--mcc-text-body');
  const title = await roleVar('--mcc-text-title');
  const label = await roleVar('--mcc-text-label');
  const numeric = await roleVar('--mcc-text-numeric');
  const control = await roleVar('--mcc-control-h');
  expect(body).not.toBe('');
  expect(numeric).not.toBe('');
  expect(control).not.toBe('');

  // 入口卡片标题用 title 角色
  const entryTitle = page.getByRole('link', { name: /销售/ }).locator('span.text-mobile-title');
  expect(await entryTitle.evaluate((el) => getComputedStyle(el).fontSize)).toBe(title);

  // 列表搜索框用 body 角色，高度等于控件高度角色
  await page.getByRole('link', { name: /销售/ }).click();
  await expect(page).toHaveURL(/\/m\/sales$/);
  await page.getByRole('link', { name: /销售单/ }).click();
  await expect(page).toHaveURL(/\/m\/sale-orders$/);
  const search = page.getByPlaceholder('搜索客户名称');
  await expect(search).toBeVisible();
  expect(await search.evaluate((el) => getComputedStyle(el).fontSize)).toBe(body);
  expect(await search.evaluate((el) => getComputedStyle(el).height)).toBe(control);

  // 列表卡片主行用 title 角色
  const firstCardTitle = page.locator('a[href^="/m/sale-orders/"] span.text-mobile-title').first();
  if ((await firstCardTitle.count()) > 0) {
    expect(await firstCardTitle.evaluate((el) => getComputedStyle(el).fontSize)).toBe(title);
  }

  // 表单标签用 label 角色（与客户表单一致，不因页面不同而漂移）
  await page.goto('/m/customers/new');
  const fieldLabel = page.getByText('客户名称', { exact: true });
  expect(await fieldLabel.evaluate((el) => getComputedStyle(el).fontSize)).toBe(label);
  const nameInput = page.getByLabel('客户名称');
  expect(await nameInput.evaluate((el) => getComputedStyle(el).height)).toBe(control);

  // 资金二级入口沿用卡片（product/平台布局.md 移动页 · 入口）：
  // 两个入口都是整块可点的链接卡片、标题取 title 角色，不得退回按钮形态
  await page.goto('/m/finance');
  const cashEntry = page.getByRole('link', { name: /资金流水/ });
  const summaryEntry = page.getByRole('link', { name: /收支汇总/ });
  await expect(cashEntry).toBeVisible();
  await expect(summaryEntry).toBeVisible();
  expect(
    await cashEntry
      .locator('span.text-mobile-title')
      .evaluate((el) => getComputedStyle(el).fontSize),
  ).toBe(title);
});

// 主色按钮的文字色与分段控件排布（design/平台布局.md §1.8）：
// text-mobile-* 若未在 cn 合并引擎登记为字号，会被当作颜色类删掉 text-primary-foreground，
// 表现为绿底近黑字；四选一分段在窄屏会折行溢出 48px 按钮。两条都在此兜底。
test('移动主色按钮文字取近白、四选一分段不溢出', async ({ page }) => {
  await page.goto('/login');
  await page.getByPlaceholder('请输入账号').fill('admin');
  await page.getByPlaceholder('请输入密码').fill('Mcc@2026');
  await page.getByRole('button', { name: '登录' }).click();
  await expect(page).toHaveURL(/\/m$/);

  const foreground = await page.evaluate(() => {
    const probe = document.createElement('span');
    probe.style.color = 'var(--primary-foreground)';
    document.body.appendChild(probe);
    const color = getComputedStyle(probe).color;
    probe.remove();
    return color;
  });

  // 主色按钮（列表底栏「新建销售单」）文字必须等于 --primary-foreground
  await page.goto('/m/sale-orders');
  const newOrder = page.getByRole('link', { name: '新建销售单' });
  expect(await newOrder.evaluate((el) => getComputedStyle(el).color)).toBe(foreground);

  // 四选一分段（资金流水方向）每个按钮不折行、不溢出，高度仍是控件高度
  await page.goto('/m/finance/cash');
  const control = await page.evaluate(() => {
    const root = document.querySelector('[data-mode="mobile"]');
    return root ? getComputedStyle(root).getPropertyValue('--mcc-control-h').trim() : '';
  });
  const radios = page.getByRole('radiogroup', { name: '方向' }).getByRole('radio');
  expect(await radios.count()).toBe(4);
  const boxes = await radios.evaluateAll((els) =>
    els.map((el) => ({
      text: el.textContent?.trim(),
      w: el.clientWidth,
      scrollW: el.scrollWidth,
      h: Math.round(el.getBoundingClientRect().height),
      innerH: el.clientHeight,
      scrollH: el.scrollHeight,
    })),
  );
  for (const box of boxes) {
    expect(box.scrollW, `${box.text} 横向溢出`).toBeLessThanOrEqual(box.w + 1);
    expect(box.scrollH, `${box.text} 纵向溢出`).toBeLessThanOrEqual(box.innerH + 1);
    expect(`${box.h}px`).toBe(control);
  }
});
