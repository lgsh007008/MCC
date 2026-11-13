'use client';

import { useState } from 'react';
import { LogOutIcon, ReceiptTextIcon, UsersIcon, WalletIcon } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { useCan } from '@/components/auth/permission-context';
import { MobileEntryCard } from '@/components/mobile/entry-card';
import { MobileHeader } from '@/components/mobile/mobile-shell';
import { api } from '@/lib/api';
import { authSession } from '@/lib/auth/session';

// 移动入口页（product/平台布局.md「移动页」）：按角色 scope 挂业务卡片；
// 当前有成品销售单与客户档案；退出登录在标题行右侧动作槽（不弹确认）。

export default function MobileHomePage(): React.ReactElement {
  const canOrder = useCan('order:view');
  const canCustomer = useCan('customer:view');
  const canFinance = useCan('finance:view');
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
            className="h-11 gap-1 px-2 text-mobile-label text-muted-foreground"
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
        <p className="text-mobile-body text-muted-foreground">选择要办理的业务</p>
        {canOrder ? (
          <MobileEntryCard
            href="/m/sale-orders"
            icon={ReceiptTextIcon}
            title="成品销售单"
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
        {canFinance ? (
          <MobileEntryCard
            href="/m/finance"
            icon={WalletIcon}
            title="资金"
            description="查流水 / 收支汇总"
          />
        ) : null}
      </div>
    </div>
  );
}
