'use client';

import Link from 'next/link';
import { useParams } from 'next/navigation';
import { useQuery } from '@tanstack/react-query';
import { buttonVariants } from '@/components/ui/button';
import { usePageCrumb } from '@/components/admin/page-breadcrumb';
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

interface SaleOrderItemDetail {
  id: string;
  seq: number;
  code: string;
  productType: string;
  pricingMode: 'volume' | 'piece';
  lengthMm: number;
  widthMm: number;
  heightMm: number;
  pieces: number;
  volumeM3: string;
  price: string;
  lineAmount: string;
  otherAmount: string;
  note: string;
}

interface SaleOrderDetail {
  id: string;
  code: string;
  saleDate: string;
  customerId: string;
  customerName: string;
  customerCode?: string | null;
  customerDeleted?: boolean;
  totalVolume: string;
  subtotalAmount: string;
  otherAmount: string;
  totalAmount: string;
  note: string;
  items: SaleOrderItemDetail[];
}

export default function SaleOrderDetailPage(): React.ReactElement {
  const params = useParams<{ id: string }>();
  // 查询带缓存（技术方案 §7.4）：切回标签先用缓存渲染，后台刷新，避免闪「加载中」
  const { data: order, error: queryError } = useQuery({
    queryKey: ['sale-order', params.id],
    queryFn: async (): Promise<SaleOrderDetail> => {
      const { data, response } = await api.GET('/api/v1/sale-orders/{id}', {
        params: { path: { id: params.id } },
      });
      if (!response.ok || !data) {
        throw new Error('销售单不存在或加载失败');
      }
      return data;
    },
  });
  const error = queryError ? '销售单不存在或加载失败' : null;

  // 面包屑页面标识 = 销售单编号（product/order.md 详情页）
  usePageCrumb(order ? [{ title: order.code }] : []);

  if (error) {
    return <p className="text-sm text-destructive">{error}</p>;
  }
  if (!order) {
    return <p className="text-sm text-muted-foreground">加载中…</p>;
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-3">
        <h1 className="text-xl font-semibold">
          销售单 {order.code}
          <span className="ml-3 text-sm font-normal text-muted-foreground">（{order.customerName}）</span>
        </h1>
      </div>

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
        {order.note ? <span>备注：{order.note}</span> : null}
      </div>

      <div className="rounded-lg border border-border bg-card">
        <Table>
          <TableHeader>
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

      <div className="flex gap-2">
        <Link href={`/admin/sale-orders/${order.id}/edit`} className={buttonVariants()}>
          编辑
        </Link>
        <Link href="/admin/sale-orders" className={buttonVariants({ variant: 'outline' })}>
          返回列表
        </Link>
      </div>
    </div>
  );
}