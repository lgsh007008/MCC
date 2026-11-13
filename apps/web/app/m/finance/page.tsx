'use client';

import Link from 'next/link';
import { ArrowLeftRightIcon, BarChart3Icon } from 'lucide-react';
import { MobileHeader } from '@/components/mobile/mobile-shell';
import { buttonVariants } from '@/components/ui/button';
import { cn } from '@/lib/utils';

// 资金二级入口（product/finance.md 移动页）：两个 48px 大按钮进资金流水与收支汇总。
export default function MobileFinanceHomePage(): React.ReactElement {
  return (
    <div>
      <MobileHeader title="资金" backHref="/m" />
      <div className="space-y-4 p-4">
        <Link
          href="/m/finance/cash"
          className={cn(buttonVariants(), 'h-14 w-full justify-start gap-3 text-mobile-title')}
        >
          <ArrowLeftRightIcon className="size-5" />
          资金流水
        </Link>
        <Link
          href="/m/finance/summary"
          className={cn(
            buttonVariants({ variant: 'outline' }),
            'h-14 w-full justify-start gap-3 text-mobile-title',
          )}
        >
          <BarChart3Icon className="size-5" />
          收支汇总
        </Link>
      </div>
    </div>
  );
}
