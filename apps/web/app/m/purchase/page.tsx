'use client';

import { ClipboardListIcon, Building2Icon } from 'lucide-react';
import { MobileEntryCard } from '@/components/mobile/entry-card';
import { MobileHeader } from '@/components/mobile/mobile-shell';

// 采购二级入口（product/平台布局.md 移动页 · 入口）：与资金二级入口同形，整卡可点。
export default function MobilePurchaseHomePage(): React.ReactElement {
  return (
    <div>
      <MobileHeader title="采购" backHref="/m" />
      <div className="space-y-4 p-4">
        <MobileEntryCard
          href="/m/purchase/orders"
          icon={ClipboardListIcon}
          title="采购单"
          description="录入 / 查看原木采购"
        />
        <MobileEntryCard
          href="/m/purchase/suppliers"
          icon={Building2Icon}
          title="供应商"
          description="查供应商 / 维护资料"
        />
      </div>
    </div>
  );
}
