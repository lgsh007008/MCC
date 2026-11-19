'use client';

import { usePageCrumb } from '@/components/admin/page-breadcrumb';
import { PackagingEditor } from '@/components/packaging/packaging-editor';

// 新建包装方案（product/包装设计.md R-包装设计-006 页面设计）：
// 直接进入未保存工作台，首次保存时才弹窗填写方案名称与客户。
export default function PackagingDesignNewPage(): React.ReactElement {
  usePageCrumb([{ title: '新建' }]);
  return <PackagingEditor />;
}
