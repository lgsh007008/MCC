'use client';

import { useParams } from 'next/navigation';
import { useQuery } from '@tanstack/react-query';
import type { ApiSchemas } from '@mcc/shared';
import { MobileHeader } from '@/components/mobile/mobile-shell';
import { MobileInfoRow } from '@/components/mobile/info-row';
import { api } from '@/lib/api';
import { formatAmount, formatQuantity } from '@/lib/format';

// 移动盘点详情（product/生产与库存.md R-生产-003）：只读；一张单只盘一类库存；无编辑 / 删除。

type CountDetail = ApiSchemas['InventoryCountDetailDto'];

const REASON_LABELS: Record<string, string> = {
  opening: '期初',
  measurement: '计量误差',
  missing: '漏记',
  damage: '损耗',
  other: '其他',
};

export default function MobileInventoryCountDetailPage(): React.ReactElement {
  const params = useParams<{ id: string }>();
  const query = useQuery({
    queryKey: ['inventory-count', params.id],
    queryFn: async (): Promise<CountDetail> => {
      const { data, response } = await api.GET('/api/v1/inventory/counts/{id}', {
        params: { path: { id: params.id } },
      });
      if (!response.ok || !data) {
        throw new Error('盘点记录加载失败');
      }
      return data;
    },
  });

  if (query.isPending) {
    return (
      <div>
        <MobileHeader title="盘点详情" backHref="/m/production/inventory/counts" />
        <p className="p-4 text-mobile-body text-muted-foreground">加载中…</p>
      </div>
    );
  }
  if (query.isError || !query.data) {
    return (
      <div>
        <MobileHeader title="盘点详情" backHref="/m/production/inventory/counts" />
        <p className="p-4 text-mobile-body text-destructive">盘点记录不存在或加载失败。</p>
      </div>
    );
  }
  const detail = query.data;
  const isTimber = detail.targetType === 'timber';
  const unit = isTimber ? 'm³' : '吨';
  const listHref = isTimber
    ? '/m/production/inventory/counts?tab=timber'
    : '/m/production/inventory/counts';

  return (
    <div>
      <MobileHeader title={detail.code} backHref={listHref} />
      <div className="space-y-4 p-4">
        <section className="space-y-2 rounded-xl border border-border bg-card p-4">
          <MobileInfoRow label="盘点类型" value={isTimber ? '方木盘点' : '原木盘点'} />
          <MobileInfoRow label="盘点日期" value={detail.adjustmentDate} />
          <MobileInfoRow label="操作人" value={detail.operatorName} />
          <MobileInfoRow label="创建时间" value={detail.createdAt.slice(0, 19).replace('T', ' ')} />
          <MobileInfoRow label="备注" value={detail.note || '—'} />
        </section>

        {detail.items.length === 0 ? (
          <p className="px-1 text-mobile-body text-muted-foreground">无盘点明细</p>
        ) : (
          detail.items.map((item) => (
            <section
              key={`${item.targetType}-${item.lengthMm}-${item.widthMm}-${item.heightMm}`}
              className="space-y-2 rounded-xl border border-border bg-card p-4"
            >
              <h2 className="text-mobile-body font-semibold">
                {item.targetType === 'timber' ? '方木规格' : '原木'}
              </h2>
              {item.targetType === 'timber' ? (
                <>
                  <MobileInfoRow label="长度" value={`${item.lengthMm} mm`} />
                  <MobileInfoRow label="宽度" value={`${item.widthMm} mm`} />
                  <MobileInfoRow label="高度" value={`${item.heightMm} mm`} />
                </>
              ) : null}
              <MobileInfoRow label="账面" value={`${formatQuantity(item.bookQuantity)} ${unit}`} />
              <MobileInfoRow label="实盘" value={`${formatQuantity(item.actualQuantity)} ${unit}`} />
              <MobileInfoRow label="差异" value={`${formatQuantity(item.differenceQuantity)} ${unit}`} />
              <MobileInfoRow label="单位成本" value={`${formatQuantity(item.unitCost)} 元/${unit}`} />
              <MobileInfoRow label="差异金额" value={`${formatAmount(item.amount)} 元`} />
              <MobileInfoRow label="原因" value={REASON_LABELS[item.reason] ?? item.reason} />
            </section>
          ))
        )}
      </div>
    </div>
  );
}
