'use client';

import { usePageCrumb } from '@/components/admin/page-breadcrumb';
import { CustomerForm } from '@/components/customer/customer-form';

// 客户新建页（product/customer.md R-客户-001 页面设计）：与编辑共用的表单组件，无初始值。
// 面包屑页面标识 =「新建」。
export default function CustomerNewPage(): React.ReactElement {
  usePageCrumb([{ title: '新建' }]);
  return (
    <div className="space-y-4">
      <h1 className="text-xl font-semibold">新建客户</h1>
      <CustomerForm />
    </div>
  );
}
