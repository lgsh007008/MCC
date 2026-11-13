'use client';

import { ArrowLeftRightIcon, BarChart3Icon } from 'lucide-react';
import { MobileEntryCard } from '@/components/mobile/entry-card';
import { MobileHeader } from '@/components/mobile/mobile-shell';

// 资金二级入口（product/finance.md 移动页）：与 /m 同形的卡片入口，
// 两项平级、不分主次；页面跳转不用按钮承载。
export default function MobileFinanceHomePage(): React.ReactElement {
  return (
    <div>
      <MobileHeader title="资金" backHref="/m" />
      <div className="space-y-4 p-4">
        <p className="text-mobile-body text-muted-foreground">选择要办理的业务</p>
        <MobileEntryCard
          href="/m/finance/cash"
          icon={ArrowLeftRightIcon}
          title="资金流水"
          description="按笔查看收付款"
        />
        <MobileEntryCard
          href="/m/finance/summary"
          icon={BarChart3Icon}
          title="收支汇总"
          description="按区间看收支与结余"
        />
      </div>
    </div>
  );
}
