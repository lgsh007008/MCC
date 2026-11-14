'use client';

import { useState } from 'react';
import Link from 'next/link';
import { useParams } from 'next/navigation';
import { useQuery } from '@tanstack/react-query';
import type { ApiSchemas } from '@mcc/shared';
import { Button, buttonVariants } from '@/components/ui/button';
import { useCan } from '@/components/auth/permission-context';
import { usePageCrumb } from '@/components/admin/page-breadcrumb';
import { PageFrame } from '@/components/admin/page-frame';
import { PrintPreviewDialog } from '@/components/order/print-preview-dialog';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { api } from '@/lib/api';

// 销售单详情页（product/order.md R-订单-001 页面设计）：主表信息 + 明细表 + 合计区（只读）。

type SaleOrderDetail = ApiSchemas['SaleOrderDto'];

export default function SaleOrderDetailPage(): React.ReactElement {
  const params = useParams<{ id: string }>();
  const [printOpen, setPrintOpen] = useState(false);
  const canManage = useCan('order:manage');
  // 查询带缓存（技术方案 §7.4）：切回标签先用缓存渲染，后台刷新，避免闪「加载中」
  const orderQuery = useQuery({
    queryKey: ['sale-orders', params.id],
    queryFn: async (): Promise<SaleOrderDetail> => {
      const { data: res, response } = await api.GET('/api/v1/sale-orders/{id}', {
        params: { path: { id: params.id } },
      });
      if (!response.ok || !res) {
        throw new Error('销售单不存在或加载失败');
      }
      return res;
    },
  });
  const order = orderQuery.data;
  const error = orderQuery.isError ? '销售单不存在或加载失败' : null;

  // 现结收款账户名称（详情只读展示）
  const accountsQuery = useQuery({
    queryKey: ['finance-accounts', 'options'],
    queryFn: async (): Promise<ApiSchemas['FinanceAccountDto'][]> => {
      const { data: res, response } = await api.GET('/api/v1/finance/accounts');
      if (!response.ok || !res) {
        throw new Error('加载失败，请稍后重试');
      }
      return res.items;
    },
    enabled: Boolean(order?.settleAccountId),
  });
  const settleAccountName = order?.settleAccountId
    ? (accountsQuery.data?.find((item) => item.id === order.settleAccountId)?.name ?? '')
    : '';

  // 面包屑页面标识 = 销售单编号（product/order.md 详情页）
  usePageCrumb(order ? [{ title: order.code }] : []);

  if (error) {
    return <p className="text-sm text-destructive">{error}</p>;
  }
  if (orderQuery.isPending || !order) {
    return <p className="text-sm text-muted-foreground">加载中…</p>;
  }

  return (
    <>
      <PageFrame
        title={
          <>
            销售单 {order.code}
            <span className="ml-3 text-xs font-normal text-muted-foreground">
              （{order.customerName}）
            </span>
          </>
        }
        actions={
          <>
            {canManage ? (
              <Link href={`/admin/sale-orders/${order.id}/edit`} className={buttonVariants()}>
                编辑
              </Link>
            ) : null}
            <Button variant="outline" onClick={() => setPrintOpen(true)}>
              打印
            </Button>
            <Link href="/admin/sale-orders" className={buttonVariants({ variant: 'outline' })}>
              返回列表
            </Link>
          </>
        }
      >
        <div className="space-y-4">
          <div className="flex flex-wrap gap-6 rounded-lg border border-border bg-card p-4 text-sm">
            <span>
              销售日期：<strong>{order.saleDate}</strong>
            </span>
            <span>
              客户编号：<strong>{order.customerCode ?? '—'}</strong>
              {order.customerDeleted ? '（已删除）' : ''}
            </span>
            <span>
              产品类型：<strong>方木</strong>
            </span>
            <span>
              合计方量：<strong>{order.totalVolume}</strong> m³
            </span>
            <span>
              小计金额：<strong>{order.subtotalAmount}</strong> 元
            </span>
            <span>
              其他金额：<strong>{order.otherAmount}</strong> 元
            </span>
            <span>
              合计金额：<strong>{order.totalAmount}</strong> 元
            </span>
            <span>
              结算方式：
              <strong>{order.settlementMode === 'settled' ? '现结' : '赊销'}</strong>
              {order.settlementMode === 'settled' ? (
                <>
                  （实收 {order.receivedAmount}
                  {settleAccountName ? ` · ${settleAccountName}` : ''}）
                </>
              ) : null}
            </span>
            {order.note ? <span>备注：{order.note}</span> : null}
          </div>

          <div className="rounded-lg border border-border bg-card">
            <Table containerClassName="max-h-[420px] overflow-y-auto">
              <TableHeader className="sticky top-0 z-10 [&_th]:bg-muted">
                <TableRow>
                  <TableHead>编码</TableHead>
                  <TableHead className="text-right">长度(mm)</TableHead>
                  <TableHead className="text-right">宽度(mm)</TableHead>
                  <TableHead className="text-right">高度(mm)</TableHead>
                  <TableHead className="text-right">根数</TableHead>
                  <TableHead className="text-right">方量(m³)</TableHead>
                  <TableHead className="text-right">单价</TableHead>
                  <TableHead className="text-right">小计金额</TableHead>
                  <TableHead className="text-right">其他金额</TableHead>
                  <TableHead>备注</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {order.items.map((item) => (
                  <TableRow key={item.id}>
                    <TableCell>{item.code}</TableCell>
                    <TableCell className="text-right tabular-nums">{item.lengthMm}</TableCell>
                    <TableCell className="text-right tabular-nums">{item.widthMm}</TableCell>
                    <TableCell className="text-right tabular-nums">{item.heightMm}</TableCell>
                    <TableCell className="text-right tabular-nums">{item.pieces}</TableCell>
                    <TableCell className="text-right tabular-nums">{item.volumeM3}</TableCell>
                    <TableCell className="text-right tabular-nums">
                      {item.price}
                      <span className="ml-1 text-xs text-muted-foreground">
                        {item.pricingMode === 'piece' ? '元/根' : '元/m³'}
                      </span>
                    </TableCell>
                    <TableCell className="text-right tabular-nums">{item.lineAmount}</TableCell>
                    <TableCell className="text-right tabular-nums">{item.otherAmount}</TableCell>
                    <TableCell>{item.note}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        </div>
      </PageFrame>

      <PrintPreviewDialog
        open={printOpen}
        onOpenChange={setPrintOpen}
        order={order}
        orderId={order.id}
      />
    </>
  );
}
