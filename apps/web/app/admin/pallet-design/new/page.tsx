'use client';

import { usePageCrumb } from '@/components/admin/page-breadcrumb';
import { PalletEditor } from '@/components/pallet/pallet-editor';

// 新建托盘项目（product/托盘设计.md R-托盘设计-001 页面设计）：默认九墩块结构，保存后跳转详情。
export default function PalletDesignNewPage(): React.ReactElement {
  usePageCrumb([{ title: '新建' }]);
  return <PalletEditor />;
}
