'use client';

import { useState } from 'react';
import { LogOutIcon, ShoppingCartIcon, TruckIcon, WalletIcon } from 'lucide-react';
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
  const canPurchase = useCan('purchase:view');
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
        {canOrder || canCustomer ? (
          <MobileEntryCard
            href="/m/sales"
            icon={ShoppingCartIcon}
            title="销售"
            description="销售单 / 客户档案"
          />
        ) : null}
        {canPurchase ? (
          <MobileEntryCard
            href="/m/purchase"
            icon={TruckIcon}
            title="采购"
            description="采购单 / 供应商"
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
