'use client';

import { usePageCrumb } from '@/components/admin/page-breadcrumb';
import { SaleOrderForm } from '@/components/order/sale-order-form';

// 销售单新建页（product/order.md R-订单-001 页面设计）：与编辑共用的表单组件，无初始值。
// 面包屑页面标识 =「新建」。
export default function SaleOrderNewPage(): React.ReactElement {
  usePageCrumb([{ title: '新建' }]);
  return (
    <div className="space-y-4">
      <h1 className="text-xl font-semibold">新建销售单</h1>
      <SaleOrderForm />
    </div>
  );
}