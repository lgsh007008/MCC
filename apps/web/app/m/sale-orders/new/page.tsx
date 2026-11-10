'use client';

import { MobileSaleOrderForm } from '@/components/mobile/sale-order-form';

// 销售单移动新建页（product/order.md 移动页）：与编辑共用移动表单，无初始值。
export default function MobileSaleOrderNewPage(): React.ReactElement {
  return <MobileSaleOrderForm />;
}
