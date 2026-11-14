'use client';

import { usePageCrumb } from '@/components/admin/page-breadcrumb';
import { PurchaseForm } from '@/components/purchase/purchase-form';

// 采购单新建页（product/purchase.md R-采购-001）：与编辑共用的表单组件，无初始值。
export default function PurchaseNewPage(): React.ReactElement {
  usePageCrumb([{ title: '新建' }]);
  return <PurchaseForm title="新建采购单" />;
}
