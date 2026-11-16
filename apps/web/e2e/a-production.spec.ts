import { expect, test } from '@playwright/test';
import { expectPageFrame } from './support/page-frame';

// 生产与库存冒烟（product/生产与库存.md R-生产-001 / R-生产-003 / R-生产-005）：
// API 预置原木领用与方木产出，验证 PC / 移动列表、表单、详情、库存页、盘点页与销售单材料毛利卡；
// 结束后经 API 软删两张单据，避免污染后续用例。
// 文件名前缀 a- 是刻意的：盘点与期初要求「期初日期早于全部库存变动」，
// 必须排在所有会开单的用例之前执行，否则干净库无法补建期初。

test('原木领用与方木产出：PC / 移动页面与材料毛利卡可达', async ({ page, request }) => {
  const login = await request.post('/api/v1/auth/login', {
    data: {
      tenantCode: 'TN-00001',
      username: 'admin',
      password: 'Mcc@2026',
      rememberMe: false,
    },
  });
  expect(login.ok()).toBeTruthy();
  const token = (await login.json()).accessToken as string;
  const headers = { Authorization: `Bearer ${token}` };

  // 干净库尚未设期初时先补建：盘点页要求期初已设，且期初日期必须早于任何库存变动，
  // 因此必须在下面的领用 / 产出之前建立；已设期初的库直接跳过，重复执行安全。
  const preSummary = await request.get('/api/v1/inventory/summary', { headers });
  expect(preSummary.ok()).toBeTruthy();
  if ((await preSummary.json()).needsOpening) {
    const opening = await request.post('/api/v1/inventory/openings', {
      headers: { ...headers, 'Idempotency-Key': `e2e-opening-${Date.now()}` },
      data: {
        openingDate: '2020-01-01',
        note: 'e2e 期初库存',
        rawLog: { quantity: '10.000', unitCost: '500.000000' },
        timber: [
          {
            lengthMm: 2500,
            widthMm: 100,
            heightMm: 20,
            quantity: '1.0000',
            unitCost: '600.000000',
          },
        ],
      },
    });
    expect(opening.status()).toBe(201);
  }

  const batch = await request.post('/api/v1/production-batches', {
    headers: { ...headers, 'Idempotency-Key': `e2e-batch-${Date.now()}` },
    data: { batchDate: '2031-01-01', note: 'e2e 生产批次' },
  });
  expect(batch.status()).toBe(201);
  const batchBody = await batch.json();

  // 待关闭批次：用于验证行关闭 / 批量关闭，避免影响上面批次后续的编辑与删除
  const closeTarget = await request.post('/api/v1/production-batches', {
    headers: { ...headers, 'Idempotency-Key': `e2e-batch-close-${Date.now()}` },
    data: { batchDate: '2031-03-01', note: 'e2e 待关闭批次' },
  });
  expect(closeTarget.status()).toBe(201);
  const closeTargetBody = await closeTarget.json();

  const issue = await request.post('/api/v1/material-issues', {
    headers: { ...headers, 'Idempotency-Key': `e2e-issue-${Date.now()}` },
    data: { issueDate: '2031-02-01', tons: '5.000', note: 'e2e 原木领用', batchId: batchBody.id },
  });
  expect(issue.status()).toBe(201);
  const issueBody = await issue.json();
  expect(String(issueBody.code)).toMatch(/^MI-\d{5}$/);

  // 方案 D：领用后、产出前，待结转 > 0（未设期初时不参与计算）
  const afterIssue = await request.get('/api/v1/inventory/summary', { headers });
  expect(afterIssue.ok()).toBeTruthy();
  const afterIssueSummary = await afterIssue.json();
  if (!afterIssueSummary.needsOpening) {
    expect(afterIssueSummary.pendingAmount).not.toBe('0.00');
  }

  const output = await request.post('/api/v1/production-outputs', {
    headers: { ...headers, 'Idempotency-Key': `e2e-output-${Date.now()}` },
    data: {
      outputDate: '2031-02-01',
      note: 'e2e 方木产出',
      batchId: batchBody.id,
      outputs: [{ lengthMm: 2500, widthMm: 100, heightMm: 20, pieces: 500, note: '' }],
    },
  });
  expect(output.status()).toBe(201);
  const outputBody = await output.json();
  expect(String(outputBody.code)).toMatch(/^PR-\d{5}$/);
  expect(outputBody.totalVolume).toBe('2.5000');

  try {
    await page.goto('/login');
    await page.getByPlaceholder('如 TN-00001').fill('TN-00001');
    await page.getByPlaceholder('请输入账号').fill('admin');
    await page.getByPlaceholder('请输入密码').fill('Mcc@2026');
    await page.getByRole('button', { name: '登录' }).click();
    await expect(page).toHaveURL(/\/admin/);

    // PC 原木领用：列表 → 详情 → 编辑
    await page.goto('/admin/production/issues');
    await expect(page.getByText(String(issueBody.code)).first()).toBeVisible();
    await expect(page.getByText('2031-02-01').first()).toBeVisible();
    // 结转状态列 + 筛选（方案 B：页面只做追溯展示）
    await expect(page.getByRole('columnheader', { name: '结转状态' })).toBeVisible();
    await expect(page.getByRole('combobox', { name: '结转状态' })).toBeVisible();
    await expect(page.getByRole('columnheader', { name: '生产批次' })).toBeVisible();
    await page.goto(`/admin/production/issues/${issueBody.id}`);
    await expectPageFrame(page, { title: String(issueBody.code), actions: ['编辑', '返回列表'] });
    await expect(page.getByText('领用吨数：')).toBeVisible();
    await expect(page.getByText('结转状态：')).toBeVisible();
    await expect(page.getByText('已结转金额：')).toBeVisible();
    await expect(page.getByText('待结转金额：')).toBeVisible();
    await page.goto(`/admin/production/issues/${issueBody.id}/edit`);
    await expect(page.getByText(/编辑原木领用/).first()).toBeVisible();
    await expect(page.locator('[data-slot="page-frame-body"]')).toBeVisible();

    // PC 方木产出：列表 → 详情 → 编辑
    await page.goto('/admin/production/outputs');
    await expect(page.getByText(String(outputBody.code)).first()).toBeVisible();
    await expect(page.getByText('2.500').first()).toBeVisible();
    // 本次结转金额列（方案 B）
    await expect(page.getByRole('columnheader', { name: '本次结转金额（元）' })).toBeVisible();
    // 方木成本口径说明弹窗（入口在产出列表）
    await page.getByRole('button', { name: '方木成本口径说明' }).click();
    await expect(page.getByRole('dialog').getByRole('heading', { name: '方木成本口径说明' })).toBeVisible();
    await expect(page.getByRole('dialog').getByText('方木池的钱从哪来')).toBeVisible();
    await page.getByRole('dialog').getByRole('button', { name: '关闭' }).click();
    await page.goto(`/admin/production/outputs/${outputBody.id}`);
    await expectPageFrame(page, { title: String(outputBody.code), actions: ['编辑', '返回列表'] });
    await expect(page.getByText('产出明细')).toBeVisible();
    await expect(page.getByRole('cell', { name: '2500' })).toBeVisible();
    await expect(page.getByText('本次结转金额：')).toBeVisible();
    await page.goto(`/admin/production/outputs/${outputBody.id}/edit`);
    await expect(page.getByText(/编辑方木产出/).first()).toBeVisible();
    await expect(page.locator('input[type="date"]')).toHaveCount(0);
    await expect(page.locator('[data-slot="page-frame-body"]')).toBeVisible();

    // PC 生产批次：弹窗新建 / 编辑、行关闭、批量关闭、详情（成本池 + 领用 / 产出）
    await page.goto('/admin/production/batches');
    await expect(page.getByText(String(batchBody.code)).first()).toBeVisible();
    await expect(page.getByText(String(closeTargetBody.code)).first()).toBeVisible();

    // 新建 / 编辑改为弹窗，不再有独立表单页
    await page.getByRole('button', { name: '新建生产批次' }).click();
    await expect(page.getByRole('dialog').getByRole('heading', { name: '新建生产批次' })).toBeVisible();
    await page.getByRole('dialog').getByRole('button', { name: '取消' }).click();

    const targetRow = page.getByRole('row', { name: new RegExp(String(closeTargetBody.code)) });
    await targetRow.getByRole('button', { name: '编辑' }).click();
    await expect(
      page.getByRole('dialog').getByRole('heading', { name: `编辑生产批次 ${closeTargetBody.code}` }),
    ).toBeVisible();
    await page.getByRole('dialog').getByRole('button', { name: '取消' }).click();

    // 行关闭：二次确认可取消
    await targetRow.getByRole('button', { name: '关闭批次' }).click();
    await expect(page.getByRole('alertdialog')).toBeVisible();
    await page.getByRole('alertdialog').getByRole('button', { name: '取消' }).click();
    await expect(targetRow.getByText('进行中')).toBeVisible();

    // 批量关闭：选中后关闭，已关闭批次自动跳过
    await page.getByRole('checkbox', { name: `选择 ${closeTargetBody.code}` }).click();
    await page.getByRole('button', { name: '批量关闭（1）' }).click();
    await expect(page.getByRole('alertdialog').getByText(/已关闭的批次自动跳过/)).toBeVisible();
    await page.getByRole('alertdialog').getByRole('button', { name: '批量关闭' }).click();
    await expect(targetRow.getByText('已关闭')).toBeVisible();

    await page.goto(`/admin/production/batches/${batchBody.id}`);
    await expectPageFrame(page, {
      title: String(batchBody.code),
      actions: ['编辑', '关闭批次', '返回列表'],
    });
    await expect(page.getByText('方木明细')).toBeVisible();

    // 库存页：未设期初时显示引导，已设期初时显示指标卡；原木 / 方木双 Tab；只保留期初入口
    await page.goto('/admin/production/inventory');
    await expect(page.getByText(/尚未设置期初库存|库存总值/).first()).toBeVisible();
    await expect(page.getByRole('link', { name: '期初库存', exact: true })).toBeVisible();
    await expect(page.locator('main').getByRole('link', { name: '库存盘点' })).toHaveCount(0);
    // 库存口径说明弹窗（product/平台布局.md「弹窗说明（只读）」）
    await page.getByRole('button', { name: '库存口径说明' }).click();
    await expect(page.getByRole('dialog').getByRole('heading', { name: '库存口径说明' })).toBeVisible();
    await expect(page.getByRole('dialog').getByText('成本怎么走')).toBeVisible();
    await page.getByRole('dialog').getByRole('button', { name: '关闭' }).click();

    // 盘点记录：独立菜单页面 + 原木 / 方木双 Tab + 新建入口带类型；不提供编辑 / 删除
    await page.goto('/admin/production/inventory/counts');
    await expect(page.getByText('IC 编号')).toBeVisible();
    await expect(page.getByRole('tab', { name: '原木盘点' })).toBeVisible();
    await page.getByRole('tab', { name: '方木盘点' }).click();
    await expect(page).toHaveURL(/tab=timber/);
    // 盘点口径说明弹窗（入口在盘点记录列表）
    await page.getByRole('button', { name: '盘点口径说明' }).click();
    await expect(page.getByRole('dialog').getByRole('heading', { name: '盘点口径说明' })).toBeVisible();
    await expect(page.getByRole('dialog').getByText('差异去哪了')).toBeVisible();
    await page.getByRole('dialog').getByRole('button', { name: '关闭' }).click();
    await expect(page.getByRole('link', { name: '新建盘点' })).toHaveAttribute(
      'href',
      /targetType=timber/,
    );

    // 新建原木盘点：实盘默认留空、原因不预选；未填实盘不允许提交
    await page.goto('/admin/production/inventory/counts/new?targetType=raw_log');
    await expect(page.getByRole('heading', { name: '新建原木盘点' })).toBeVisible();
    await expect(page.getByPlaceholder('留空不盘')).toHaveValue('');
    await expect(page.getByText('选填').first()).toBeVisible();
    await expect(page.getByRole('button', { name: '按账面填充' })).toBeVisible();
    // 新建盘点页不挂口径入口（入口在盘点记录列表）
    await expect(page.getByRole('button', { name: '盘点口径说明' })).toHaveCount(0);
    await page.getByRole('button', { name: '保存盘点' }).click();
    await expect(page.getByText('请填写原木实盘吨数')).toBeVisible();

    // 新建方木盘点：单类型页（无原木 Tab），规格分三列，不提供添加规格行
    await page.goto('/admin/production/inventory/counts/new?targetType=timber');
    await expect(page.getByRole('heading', { name: '新建方木盘点' })).toBeVisible();
    await expect(page.getByRole('tab', { name: '原木盘点' })).toHaveCount(0);
    await expect(page.getByRole('button', { name: '添加规格行' })).toHaveCount(0);
    await expect(page.getByRole('columnheader', { name: '长度（mm）' })).toBeVisible();
    await expect(page.getByRole('columnheader', { name: '宽度（mm）' })).toBeVisible();
    await expect(page.getByRole('columnheader', { name: '高度（mm）' })).toBeVisible();

    // 盘点详情只读（存在历史盘点时才校验）
    const counts = await request.get('/api/v1/inventory/counts?page=1&pageSize=1', { headers });
    expect(counts.ok()).toBeTruthy();
    const countItems = (await counts.json()).items as Array<{ id: string }>;
    if (countItems[0]) {
      await page.goto(`/admin/production/inventory/counts/${countItems[0].id}`);
      await expect(page.getByText('盘点类型：')).toBeVisible();
      await expect(page.getByRole('button', { name: /^(编辑|删除)$/ })).toHaveCount(0);
    }

    // 销售单详情材料毛利卡：admin 有 profit:view
    const orders = await request.get('/api/v1/sale-orders?page=1&pageSize=1', { headers });
    expect(orders.ok()).toBeTruthy();
    const orderItems = (await orders.json()).items as Array<{ id: string }>;
    if (orderItems[0]) {
      await page.goto(`/admin/sale-orders/${orderItems[0].id}`);
      await expect(page.getByText('材料毛利').first()).toBeVisible();
      await expect(page.getByText('下单时按批次先进先出快照，未含人工与费用。')).toBeVisible();
      // 成本来源默认收起：有扣层时展开可看明细
      const sourceToggle = page.getByRole('button', { name: '展开成本来源' });
      if ((await sourceToggle.count()) > 0) {
        await sourceToggle.click();
        await expect(page.getByRole('button', { name: '收起成本来源' })).toBeVisible();
      }
      // 材料毛利口径说明弹窗
      await page.getByRole('button', { name: '口径说明' }).click();
      await expect(
        page.getByRole('dialog').getByRole('heading', { name: '材料毛利口径说明' }),
      ).toBeVisible();
      await expect(page.getByRole('dialog').getByText('为什么是快照')).toBeVisible();
      await page.getByRole('dialog').getByRole('button', { name: '关闭' }).click();
    }

    // 移动端：生产入口（原木领用 / 方木产出 / 库存 / 库存盘点）
    await page.goto('/m/production');
    await expect(page.getByRole('heading', { name: '生产' })).toBeVisible();
    await expect(page.getByText('原木领用').first()).toBeVisible();
    await expect(page.getByText('方木产出').first()).toBeVisible();
    await expect(page.getByText('库存盘点').first()).toBeVisible();

    await page.goto('/m/production/issues');
    await expect(page.getByRole('heading', { name: '原木领用' })).toBeVisible();
    await expect(page.getByText(String(issueBody.code)).first()).toBeVisible();
    // 卡片右上结转状态徽标
    const issueCard = page.locator('a', { hasText: String(issueBody.code) }).first();
    await expect(issueCard.getByText(/待结转|已结转/)).toBeVisible();
    await page.goto(`/m/production/issues/${issueBody.id}`);
    await expect(page.getByRole('heading', { name: String(issueBody.code) })).toBeVisible();
    await expect(page.getByText('5.000 吨').first()).toBeVisible();
    await expect(page.getByText('结转状态')).toBeVisible();
    await expect(page.getByText('已结转', { exact: true }).first()).toBeVisible();

    await page.goto('/m/production/outputs');
    await expect(page.getByRole('heading', { name: '方木产出' })).toBeVisible();
    await expect(page.getByText(String(outputBody.code)).first()).toBeVisible();
    // 卡片次行含本次结转金额
    const outputCard = page.locator('a', { hasText: String(outputBody.code) }).first();
    await expect(outputCard.getByText(/本次结转 .* 元/)).toBeVisible();
    // 移动产出列表页头口径说明
    await page.getByRole('button', { name: '口径说明' }).click();
    await expect(
      page.getByRole('dialog').getByRole('heading', { name: '方木成本口径说明' }),
    ).toBeVisible();
    await page.getByRole('dialog').getByRole('button', { name: '关闭' }).click();
    await page.goto(`/m/production/outputs/${outputBody.id}`);
    await expect(page.getByRole('heading', { name: String(outputBody.code) })).toBeVisible();
    await expect(page.getByText('2.500 m³').first()).toBeVisible();
    await expect(page.getByText('本次结转金额')).toBeVisible();
    await expect(page.getByText('来源领用单')).toBeVisible();

    // 移动生产批次：列表底部新建弹窗 + 详情编辑弹窗（与 PC 共用同一弹窗）
    await page.goto('/m/production/batches');
    await expect(page.getByRole('heading', { name: '生产批次' })).toBeVisible();
    await expect(page.getByText(String(batchBody.code)).first()).toBeVisible();
    await page.getByRole('button', { name: '新建生产批次' }).click();
    await expect(page.getByRole('dialog').getByRole('heading', { name: '新建生产批次' })).toBeVisible();
    await page.getByRole('dialog').getByRole('button', { name: '取消' }).click();
    await page.goto(`/m/production/batches/${batchBody.id}`);
    await expect(page.getByRole('heading', { name: String(batchBody.code) })).toBeVisible();
    await page.getByRole('button', { name: '编辑' }).click();
    await expect(
      page.getByRole('dialog').getByRole('heading', { name: `编辑生产批次 ${batchBody.code}` }),
    ).toBeVisible();
    await page.getByRole('dialog').getByRole('button', { name: '取消' }).click();

    // 移动库存页：底部只保留期初入口，不再放盘点按钮
    await page.goto('/m/production/inventory');
    await expect(page.getByRole('link', { name: '期初库存' })).toBeVisible();
    await expect(page.getByRole('link', { name: '库存盘点' })).toHaveCount(0);
    // 移动库存页复用同一口径弹窗（未设期初时无库存总值卡，不挂入口）
    if ((await page.getByRole('button', { name: '口径说明' }).count()) > 0) {
      await page.getByRole('button', { name: '口径说明' }).click();
      await expect(
        page.getByRole('dialog').getByRole('heading', { name: '库存口径说明' }),
      ).toBeVisible();
      await page.getByRole('dialog').getByRole('button', { name: '关闭' }).click();
    }

    // 移动盘点记录列表：原木 / 方木分段切换，新建入口带类型
    await page.goto('/m/production/inventory/counts');
    await expect(page.getByRole('heading', { name: '库存盘点' })).toBeVisible();
    // 移动盘点列表页头口径说明
    await page.getByRole('button', { name: '口径说明' }).click();
    await expect(
      page.getByRole('dialog').getByRole('heading', { name: '盘点口径说明' }),
    ).toBeVisible();
    await page.getByRole('dialog').getByRole('button', { name: '关闭' }).click();
    await expect(page.getByRole('link', { name: '新建盘点' })).toHaveAttribute(
      'href',
      /targetType=raw_log/,
    );
    await page.getByRole('radio', { name: '方木盘点' }).click();
    await expect(page).toHaveURL(/tab=timber/);
    await expect(page.getByRole('link', { name: '新建盘点' })).toHaveAttribute(
      'href',
      /targetType=timber/,
    );
  } finally {
    await request.delete(`/api/v1/material-issues/${issueBody.id}`, { headers });
    await request.delete(`/api/v1/production-outputs/${outputBody.id}`, { headers });
  }
});
