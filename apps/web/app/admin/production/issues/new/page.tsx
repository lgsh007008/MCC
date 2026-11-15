'use client';

import { usePageCrumb } from '@/components/admin/page-breadcrumb';
import { MaterialIssueForm } from '@/components/production/material-issue-form';

export default function NewMaterialIssuePage(): React.ReactElement {
  usePageCrumb([{ title: '新建' }]);
  return <MaterialIssueForm />;
}
