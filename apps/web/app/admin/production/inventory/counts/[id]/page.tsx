'use client';

import Link from 'next/link';
import { useParams } from 'next/navigation';
import { useQuery } from '@tanstack/react-query';
import type { ApiSchemas } from '@mcc/shared';
import { buttonVariants } from '@/components/ui/button';
import { PageFrame } from '@/components/admin/page-frame';
import { usePageCrumb } from '@/components/admin/page-breadcrumb';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { api } from '@/lib/api';
import { formatAmount, formatQuantity } from '@/lib/format';

// 盘点详情（product/生产与库存.md R-生产-003）：只读；一张单只盘一类库存；无编辑 / 删除。

type CountDetail = ApiSchemas['InventoryCountDetailDto'];

const REASON_LABELS: Record<string, string> = {
  opening: '期初',
  measurement: '计量误差',
  missing: '漏记',
  damage: '损耗',
  other: '其他',
};

export default function InventoryCountDetailPage(): React.ReactElement {
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
  usePageCrumb(query.data ? [{ title: query.data.code }] : []);

  if (query.isPending) {
    return <p className="text-sm text-muted-foreground">加载中…</p>;
  }
  if (query.isError || !query.data) {
    return <p className="text-sm text-destructive">盘点记录不存在或加载失败。</p>;
  }
  const detail = query.data;
  const isTimber = detail.targetType === 'timber';
  const unit = isTimber ? 'm³' : '吨';

  return (
    <PageFrame
      title={detail.code}
      actions={
        <Link
          href={isTimber ? '/admin/production/inventory/counts?tab=timber' : '/admin/production/inventory/counts'}
          className={buttonVariants({ variant: 'outline' })}
        >
          返回列表
        </Link>
      }
    >
      <div className="space-y-4">
        <section className="rounded-lg border border-border bg-card p-4">
          <div className="grid gap-3 text-sm sm:grid-cols-2 xl:grid-cols-5">
            <div>
              <span className="text-muted-foreground">盘点类型：</span>
              {isTimber ? '方木盘点' : '原木盘点'}
            </div>
            <div>
              <span className="text-muted-foreground">盘点日期：</span>
              {detail.adjustmentDate}
            </div>
            <div>
              <span className="text-muted-foreground">操作人：</span>
              {detail.operatorName}
            </div>
            <div>
              <span className="text-muted-foreground">创建时间：</span>
              {detail.createdAt.slice(0, 19).replace('T', ' ')}
            </div>
            <div>
              <span className="text-muted-foreground">备注：</span>
              {detail.note || '—'}
            </div>
          </div>
        </section>

        <section className="rounded-lg border border-border bg-card">
          <Table containerClassName="max-h-[480px] overflow-y-auto">
            <TableHeader className="sticky top-0 z-10 [&_th]:bg-muted">
              <TableRow>
                <TableHead>{isTimber ? '长度（mm）' : '库存对象'}</TableHead>
                {isTimber ? (
                  <>
                    <TableHead>宽度（mm）</TableHead>
                    <TableHead>高度（mm）</TableHead>
                  </>
                ) : null}
                <TableHead className="text-right">账面（{unit}）</TableHead>
                <TableHead className="text-right">实盘（{unit}）</TableHead>
                <TableHead className="text-right">差异（{unit}）</TableHead>
                <TableHead className="text-right">单位成本（元/{unit}）</TableHead>
                <TableHead className="text-right">差异金额（元）</TableHead>
                <TableHead>原因</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {detail.items.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={isTimber ? 9 : 7} className="text-muted-foreground">
                    无盘点明细
                  </TableCell>
                </TableRow>
              ) : (
                detail.items.map((item) => (
                  <TableRow key={`${item.targetType}-${item.lengthMm}-${item.widthMm}-${item.heightMm}`}>
                    <TableCell className="tabular-nums">
                      {item.targetType === 'timber' ? item.lengthMm : '原木'}
                    </TableCell>
                    {isTimber ? (
                      <>
                        <TableCell className="tabular-nums">{item.widthMm}</TableCell>
                        <TableCell className="tabular-nums">{item.heightMm}</TableCell>
                      </>
                    ) : null}
                    <TableCell className="text-right tabular-nums">
                      {formatQuantity(item.bookQuantity)}
                    </TableCell>
                    <TableCell className="text-right tabular-nums">
                      {formatQuantity(item.actualQuantity)}
                    </TableCell>
                    <TableCell className="text-right tabular-nums">
                      {formatQuantity(item.differenceQuantity)}
                    </TableCell>
                    <TableCell className="text-right tabular-nums">
                      {formatQuantity(item.unitCost)}
                    </TableCell>
                    <TableCell className="text-right tabular-nums">{formatAmount(item.amount)}</TableCell>
                    <TableCell>{REASON_LABELS[item.reason] ?? item.reason}</TableCell>
                  </TableRow>
                ))
              )}
            </TableBody>
          </Table>
        </section>
      </div>
    </PageFrame>
  );
}
