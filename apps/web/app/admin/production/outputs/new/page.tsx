'use client';

import { usePageCrumb } from '@/components/admin/page-breadcrumb';
import { ProductionOutputForm } from '@/components/production/production-output-form';

export default function NewProductionOutputPage(): React.ReactElement {
  usePageCrumb([{ title: '新建' }]);
  return <ProductionOutputForm />;
}
