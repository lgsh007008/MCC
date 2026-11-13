'use client';

import { useRouter } from 'next/navigation';
import { MobileCashEntryForm } from '@/components/mobile/finance-cash-entry-form';
import { MobileHeader } from '@/components/mobile/mobile-shell';

// 移动端登记资金流水（product/finance.md 移动页）：单列表单页，保存后回列表并刷新。
export default function MobileCashEntryNewPage(): React.ReactElement {
  const router = useRouter();

  return (
    <div>
      <MobileHeader title="登记流水" backHref="/m/finance/cash" />
      <MobileCashEntryForm
        onSaved={() => router.replace('/m/finance/cash')}
        onCancel={() => router.back()}
      />
    </div>
  );
}
