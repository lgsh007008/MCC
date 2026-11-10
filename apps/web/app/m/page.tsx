'use client';

import { useState } from 'react';
import Link from 'next/link';
import { ChevronRightIcon, LogOutIcon, ReceiptTextIcon } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { MobileHeader } from '@/components/mobile/mobile-shell';
import { api } from '@/lib/api';
import { authSession } from '@/lib/auth/session';

// 移动入口页（product/平台布局.md「移动页」）：大卡片功能入口，当前只有成品销售单开单。
// 退出登录放在标题行右侧动作槽：调登出接口、清会话、回登录页（与 PC 同口径，不弹确认）。
export default function MobileHomePage(): React.ReactElement {
  const [loggingOut, setLoggingOut] = useState(false);

  async function handleLogout(): Promise<void> {
    setLoggingOut(true);
    try {
      await api.POST('/api/v1/auth/logout', {});
    } catch {
      // 接口失败也清本地会话并回登录页，避免卡在移动端无法退出
    }
    authSession.clear();
    window.location.assign('/login');
  }

  return (
    <div>
      <MobileHeader
        title="手机开单"
        action={
          <Button
            type="button"
            variant="ghost"
            className="h-11 gap-1 px-2 text-sm text-muted-foreground"
            aria-label="退出登录"
            title="退出登录"
            disabled={loggingOut}
            onClick={() => void handleLogout()}
          >
            <LogOutIcon className="size-4" />
            退出
          </Button>
        }
      />
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
