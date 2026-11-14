'use client';

import { ReceiptTextIcon, UsersIcon } from 'lucide-react';
import { useCan } from '@/components/auth/permission-context';
import { MobileEntryCard } from '@/components/mobile/entry-card';
import { MobileHeader } from '@/components/mobile/mobile-shell';

// 销售二级入口（product/平台布局.md 移动页 · 入口）：与采购、资金二级入口同形，整卡可点。
export default function MobileSalesHomePage(): React.ReactElement {
  const canOrder = useCan('order:view');
  const canCustomer = useCan('customer:view');
  return (
    <div>
      <MobileHeader title="销售" backHref="/m" />
      <div className="space-y-4 p-4">
        {canOrder ? (
          <MobileEntryCard
            href="/m/sale-orders"
            icon={ReceiptTextIcon}
            title="销售单"
            description="开单 / 查单"
          />
        ) : null}
        {canCustomer ? (
          <MobileEntryCard
            href="/m/customers"
            icon={UsersIcon}
            title="客户档案"
            description="查客户 / 维护资料"
          />
        ) : null}
      </div>
    </div>
  );
}
