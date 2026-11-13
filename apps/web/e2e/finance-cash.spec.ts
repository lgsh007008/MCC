import { expect, test } from '@playwright/test';

// 资金收付冒烟（product/finance.md R-财务-002）：
// 菜单 → 资金流水页（主从列表 / 筛选与级联 / 账户启停删除 / 流水 / 两侧详情弹窗）→ 汇总资金四卡。
// 数据经接口准备（账户 / 客户 / 收款），测试结束删除流水、客户与临时账户。

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

test('资金流水 → 收支汇总资金卡', async ({ page }) => {
  const stamp = Date.now();
  const accountNameA = 'e2e资金账户A';
  const accountNameB = 'e2e资金账户B';
  const customerName = `e2e 资金客户-${stamp}`;
  const entryNoteA = `e2e 收款A-${stamp}`;
  const entryNoteB = `e2e 收款B-${stamp}`;
  const entryNoteC = `e2e 其他收入-${stamp}`;

  await page.goto('/login');
  await page.getByPlaceholder('请输入账号').fill('admin');
  await page.getByPlaceholder('请输入密码').fill('Mcc@2026');
  await page.getByRole('button', { name: '登录' }).click();
  await expect(page).toHaveURL(/\/admin$/);

  // 财务分组两项菜单（台账、固定资产均已下线）
  for (const name of ['资金流水', '收支汇总']) {
    await expect(page.getByRole('link', { name, exact: true })).toBeVisible();
  }
  await expect(page.getByRole('link', { name: '财务台账', exact: true })).toHaveCount(0);
  await expect(page.getByRole('link', { name: '固定资产', exact: true })).toHaveCount(0);

  const refresh = await page.request.post('/api/v1/auth/refresh', { data: {} });
  const { accessToken } = (await refresh.json()) as { accessToken: string };
  const auth = { Authorization: `Bearer ${accessToken}` };

  // 账户（固定名称，已存在则复用；账户不提供删除，避免测试残留累积）
  const ensureAccount = async (name: string, index: number): Promise<string> => {
    const list = await page.request.get('/api/v1/finance/accounts', { headers: auth });
    const items = (
      (await list.json()) as { items: Array<{ id: string; name: string; active: boolean }> }
    ).items;
    const existing = items.find((item) => item.name === name);
    if (existing) {
      // 历史运行可能停用（弹窗默认账户只列启用账户），复用时恢复启用
      if (!existing.active) {
        const updated = await page.request.put(`/api/v1/finance/accounts/${existing.id}`, {
          headers: auth,
          data: {
            name,
            kind: index === 0 ? 'corporate' : 'personal',
            channel: index === 0 ? 'bank' : 'wechat',
            openingBalance: '0.00',
            active: true,
          },
        });
        expect(updated.ok()).toBeTruthy();
      }
      return existing.id;
    }
    const created = await page.request.post('/api/v1/finance/accounts', {
      headers: auth,
      data: {
        name,
        kind: index === 0 ? 'corporate' : 'personal',
        channel: index === 0 ? 'bank' : 'wechat',
        openingBalance: '0.00',
      },
    });
    expect(created.ok()).toBeTruthy();
    return ((await created.json()) as { id: string }).id;
  };

  const accountIdA = await ensureAccount(accountNameA, 0);
  const accountIdB = await ensureAccount(accountNameB, 1);

  const customerRes = await page.request.post('/api/v1/customers', {
    headers: auth,
    data: { name: customerName },
  });
  expect(customerRes.ok()).toBeTruthy();
  const customer = (await customerRes.json()) as { id: string };

  const createEntry = async (accountId: string, amount: string, note: string) => {
    const res = await page.request.post('/api/v1/finance/cash-entries', {
      headers: auth,
      data: {
        direction: 'in',
        occurredDate: new Date().toISOString().slice(0, 10),
        amount,
        accountId,
        category: 'sales_receipt',
        customerId: customer.id,
        note,
      },
    });
    expect(res.ok()).toBeTruthy();
    return (await res.json()) as { id: string; code: string };
  };

  const entryA = await createEntry(accountIdA, '200.00', entryNoteA);
  const entryB = await createEntry(accountIdB, '300.00', entryNoteB);
  // 其他收入：无客户、收款方向，用于验证客户筛选与分类级联
  const otherRes = await page.request.post('/api/v1/finance/cash-entries', {
    headers: auth,
    data: {
      direction: 'in',
      occurredDate: new Date().toISOString().slice(0, 10),
      amount: '50.00',
      accountId: accountIdA,
      category: 'other_revenue',
      note: entryNoteC,
    },
  });
  expect(otherRes.ok()).toBeTruthy();
  const entryC = (await otherRes.json()) as { id: string; code: string };
  const tempAccountName = `e2e临时账户-${stamp}`;
  const tempAccountRes = await page.request.post('/api/v1/finance/accounts', {
    headers: auth,
    data: { name: tempAccountName, kind: 'personal', channel: 'cash', openingBalance: '0.00' },
  });
  expect(tempAccountRes.ok()).toBeTruthy();
  const tempAccountId = ((await tempAccountRes.json()) as { id: string }).id;

  try {
    // 资金流水页：左栏账户列表 + 右栏流水（默认「全部账户」）
    await page.getByRole('link', { name: '资金流水', exact: true }).click();
    await expect(page).toHaveURL(/\/admin\/finance\/cash$/);
    const allAccounts = page.getByRole('button', { name: /全部账户/ });
    await expect(allAccounts).toBeVisible();
    await expect(allAccounts).toContainText('个启用');
    const leftAccountA = page.getByRole('button', { name: new RegExp(accountNameA) });
    const leftAccountB = page.getByRole('button', { name: new RegExp(accountNameB) });
    const leftRowA = leftAccountA.locator('..');
    await expect(leftAccountA).toBeVisible();
    await expect(leftAccountB).toBeVisible();
    // 左栏一行：名称 + 状态；行操作收进行尾「⋯」菜单；不显示金额
    await expect(leftRowA).toContainText('启用');
    await expect(leftRowA).not.toContainText('200.00');
    await expect(page.getByRole('columnheader', { name: '客户', exact: true })).toBeVisible();
    await expect(page.getByRole('columnheader', { name: '备注', exact: true })).toBeVisible();
    await expect(page.getByRole('columnheader', { name: '方式', exact: true })).toHaveCount(0);
    const rowA = page.getByRole('row').filter({ hasText: entryNoteA });
    const rowB = page.getByRole('row').filter({ hasText: entryNoteB });
    await expect(rowA).toBeVisible();
    await expect(rowB).toBeVisible();
    await expect(rowA).toContainText(entryA.code);
    await expect(rowA).toContainText('+200.00');
    await expect(rowA).toContainText(customerName);
    await expect(rowA).toContainText('销售回款');
    await expect(page.getByRole('cell', { name: '合计', exact: true })).toBeVisible();

    // 客户筛选：只列该客户的收款流水（其他收入无客户，被排除）
    const rowC = page.getByRole('row').filter({ hasText: entryNoteC });
    await expect(rowC).toBeVisible();
    await page.getByLabel('客户', { exact: true }).click();
    await page.getByRole('option', { name: customerName, exact: true }).click();
    await page.getByRole('button', { name: '查询', exact: true }).click();
    await expect(rowA).toBeVisible();
    await expect(rowC).toHaveCount(0);

    // 方向 → 收支分类级联：选收款只列收款分类；内部转账无分类，分类清空并禁用
    await page.getByLabel('方向', { exact: true }).click();
    await page.getByRole('option', { name: '收款', exact: true }).click();
    await page.getByLabel('收支分类', { exact: true }).click();
    await expect(page.getByRole('option', { name: '销售回款', exact: true })).toBeVisible();
    await expect(page.getByRole('option', { name: '采购付款', exact: true })).toHaveCount(0);
    await page.getByRole('option', { name: '销售回款', exact: true }).click();
    await page.getByRole('button', { name: '查询', exact: true }).click();
    await expect(rowC).toHaveCount(0);
    await page.getByLabel('方向', { exact: true }).click();
    await page.getByRole('option', { name: '内部转账', exact: true }).click();
    const categoryFilter = page.getByLabel('收支分类', { exact: true });
    await expect(categoryFilter).toContainText('内部转账无分类');
    await expect(categoryFilter).toBeDisabled();
    await page.getByRole('button', { name: '重置', exact: true }).click();

    // 左栏点击即筛选右栏
    await leftAccountA.click();
    await expect(rowA).toBeVisible();
    await expect(rowB).toHaveCount(0);
    await leftAccountB.click();
    await expect(rowB).toBeVisible();
    await expect(rowA).toHaveCount(0);

    // 重置 = 清空筛选 + 左栏回「全部账户」
    await page.getByRole('button', { name: '重置', exact: true }).click();
    await expect(rowA).toBeVisible();
    await expect(rowB).toBeVisible();

    // 左栏行操作在行尾「⋯」菜单：停用需二次确认、启用不确认，状态即时反映
    await leftRowA.getByRole('button', { name: '账户操作' }).click();
    await page.getByRole('menuitem', { name: '停用', exact: true }).click();
    const stopDialog = page.getByRole('alertdialog');
    await expect(stopDialog.getByText('停用资金账户')).toBeVisible();
    await stopDialog.getByRole('button', { name: '停用', exact: true }).click();
    await expect(leftRowA).toContainText('停用');
    await leftRowA.getByRole('button', { name: '账户操作' }).click();
    await page.getByRole('menuitem', { name: '启用', exact: true }).click();
    await expect(leftRowA).toContainText('启用');

    // 删除：菜单 → 二次确认后账户从列表消失
    const tempRow = page.getByRole('button', { name: new RegExp(tempAccountName) }).locator('..');
    await tempRow.getByRole('button', { name: '账户操作' }).click();
    await page.getByRole('menuitem', { name: '删除', exact: true }).click();
    const deleteDialog = page.getByRole('alertdialog');
    await expect(deleteDialog.getByText('删除资金账户')).toBeVisible();
    await deleteDialog.getByRole('button', { name: '删除', exact: true }).click();
    await expect(page.getByRole('button', { name: new RegExp(tempAccountName) })).toHaveCount(0);

    // 流水详情：编号为可点击链接，行内「查看」同样打开详情
    await rowB.getByRole('button', { name: entryB.code }).click();
    const entryDetail = page.getByRole('dialog');
    await expect(entryDetail.getByText(`流水详情 ${entryB.code}`)).toBeVisible();
    await expect(entryDetail.getByText(entryNoteB)).toBeVisible();
    await expect(entryDetail.getByText('销售回款', { exact: true })).toBeVisible();
    await entryDetail.getByRole('button', { name: '关闭', exact: true }).click();
    await expect(entryDetail).toHaveCount(0);

    // 账户详情：行尾菜单「查看详情」打开详情，详情 → 编辑为状态切换、不嵌套
    await leftRowA.getByRole('button', { name: '账户操作' }).click();
    await page.getByRole('menuitem', { name: '查看详情', exact: true }).click();
    const accountDetail = page.getByRole('dialog');
    await expect(accountDetail.getByText(/^账户详情 AC-/)).toBeVisible();
    await expect(accountDetail.getByText(accountNameA, { exact: true })).toBeVisible();
    await expect(accountDetail.getByText('当前余额', { exact: true })).toBeVisible();
    await accountDetail.getByRole('button', { name: '编辑', exact: true }).click();
    const accountForm = page.getByRole('dialog');
    await expect(accountForm.getByText(/^编辑账户 AC-/)).toBeVisible();
    await accountForm.getByRole('button', { name: '取消' }).click();
    await expect(accountForm).toHaveCount(0);

    // 登记流水弹窗：默认带入左栏选中账户；不做改动直接取消
    await leftAccountA.click();
    const dialog = page.getByRole('dialog');
    await page.getByRole('button', { name: '登记流水' }).click();
    await expect(dialog.getByText('登记资金流水')).toBeVisible();
    await expect(dialog.getByText(accountNameA, { exact: true })).toBeVisible();
    await expect(dialog.getByText('客户', { exact: true })).toBeVisible();
    await dialog.getByRole('button', { name: '取消' }).click();
    await expect(dialog).toHaveCount(0);

    // 收支汇总：页内 Tab → 资金收付（期间三卡 + 当前资金总额 + 账户余额列表），Tab 写入 URL
    await page.getByRole('link', { name: '收支汇总', exact: true }).click();
    await expect(page).toHaveURL(/\/admin\/finance\/summary$/);
    await expect(page.getByText('总收入', { exact: true })).toBeVisible();
    await page.getByRole('tab', { name: '资金收付' }).click();
    await expect(page).toHaveURL(/\/admin\/finance\/summary\?tab=funds$/);
    await expect(page.getByText('期间收款', { exact: true })).toBeVisible();
    await expect(page.getByText('期间付款', { exact: true })).toBeVisible();
    await expect(page.getByText('净流入', { exact: true })).toBeVisible();
    await expect(page.getByText(/当前资金总额/)).toBeVisible();
    await expect(page.getByRole('row').filter({ hasText: accountNameA })).toBeVisible();

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
  } finally {
    await page.request.delete(`/api/v1/finance/cash-entries/${entryA.id}`, { headers: auth });
    await page.request.delete(`/api/v1/finance/cash-entries/${entryB.id}`, { headers: auth });
    await page.request.delete(`/api/v1/finance/cash-entries/${entryC.id}`, { headers: auth });
    await page.request.delete(`/api/v1/finance/accounts/${tempAccountId}`, { headers: auth });
    await page.request.delete(`/api/v1/customers/${customer.id}`, { headers: auth });
  }
});
