'use client';

import { usePageCrumb } from '@/components/admin/page-breadcrumb';
import { SupplierForm } from '@/components/supplier/supplier-form';

// 供应商新建页（product/supplier.md R-供应商-001）：与编辑共用的表单组件，无初始值。
export default function SupplierNewPage(): React.ReactElement {
  usePageCrumb([{ title: '新建' }]);
  return <SupplierForm title="新建供应商" />;
}
