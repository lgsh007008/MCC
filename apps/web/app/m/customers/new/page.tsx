'use client';

import { MobileCustomerForm } from '@/components/mobile/customer-form';

// 客户移动新建页（product/customer.md 移动页）：与编辑共用移动表单，无初始值。
export default function MobileCustomerNewPage(): React.ReactElement {
  return <MobileCustomerForm />;
}
