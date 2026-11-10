'use client';

import Link from 'next/link';
import { ChevronRightIcon, ReceiptTextIcon } from 'lucide-react';
import { MobileHeader } from '@/components/mobile/mobile-shell';

// 移动入口页（product/平台布局.md「移动页」）：大卡片功能入口，当前只有成品销售单开单。
export default function MobileHomePage(): React.ReactElement {
  return (
    <div>
      <MobileHeader title="手机开单" />
      <div className="space-y-4 p-4">
        <p className="text-sm text-muted-foreground">选择要办理的业务</p>
        <Link
          href="/m/sale-orders"
          className="flex min-h-20 items-center gap-4 rounded-xl border border-border bg-card p-5 hover:bg-muted/60"
        >
          <ReceiptTextIcon className="size-8 shrink-0" />
          <span className="min-w-0 flex-1">
            <span className="block text-lg font-medium">成品销售单</span>
            <span className="mt-1 block text-sm text-muted-foreground">开单 / 查单</span>
          </span>
          <ChevronRightIcon className="size-5 shrink-0 text-muted-foreground" />
        </Link>
      </div>
    </div>
  );
}
