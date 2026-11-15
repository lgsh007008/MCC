import { api } from '@/lib/api';

// 销售单保存前的方木成本检查（product/生产与库存.md R-生产-004）：
// 没有有效方木平均成本时仍允许保存，但材料成本记「成本待补」；
// 页面据此二次确认，建议先录方木产出，避免销售出库按 0 成本扣减库存池。

export async function hasNoValidTimberCost(): Promise<boolean> {
  try {
    const { data, response } = await api.GET('/api/v1/inventory/summary');
    if (!response.ok || !data) {
      return false;
    }
    return data.needsOpening || data.timber.unitCost === '0.000000';
  } catch {
    return false;
  }
}

export async function isMaterialCostPending(orderId: string): Promise<boolean> {
  try {
    const { data, response } = await api.GET('/api/v1/sale-orders/{id}/profit', {
      params: { path: { id: orderId } },
    });
    return response.ok && data?.materialCostStatus === 'pending';
  } catch {
    return false;
  }
}

// 新建方木产出前的提示：待结转为 0、或产出日期早于最近一笔领用。
export async function outputCostWarnings(outputDate: string): Promise<string[]> {
  const warnings: string[] = [];
  try {
    const { data, response } = await api.GET('/api/v1/inventory/summary');
    if (response.ok && data && data.pendingAmount === '0.00') {
      warnings.push('当前没有待结转成本，产出将按 0 成本入库；请先录原木领用');
    }
  } catch {
    // 库存查询失败时不提示，避免阻断正常录入
  }
  try {
    const { data, response } = await api.GET('/api/v1/material-issues', {
      params: { query: { page: 1, pageSize: 1 } },
    });
    const latest = response.ok ? data?.items[0]?.issueDate : undefined;
    if (latest && outputDate < latest) {
      warnings.push(
        `产出日期早于最近一笔原木领用（${latest}），成本不会结转到本单；建议把产出日期改到领用之后`,
      );
    }
  } catch {
    // 领用日期查询失败时不提示
  }
  return warnings;
}
