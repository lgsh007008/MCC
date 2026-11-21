'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { LogOutIcon } from 'lucide-react';
import { hasPlatformScope, type PlatformRole } from '@mcc/shared';
import { Avatar, AvatarFallback } from '@/components/ui/avatar';
import { UserSilhouetteIcon } from '@/components/ui/user-silhouette-icon';
import { Button } from '@/components/ui/button';
import { ConfirmProvider } from '@/components/ui/confirm-dialog';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuGroup,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { cn } from '@/lib/utils';
import { opsApi, refreshOpsSession } from '@/lib/ops/api';
import { currentOpsRole, currentOpsUsername, opsSession } from '@/lib/ops/session';
import { findOpsNavByPath, scopeForOpsPath, visibleOpsNav } from '@/lib/ops-nav';

// 平台运营壳（design/平台布局.md §1.9）：简化三件——左侧固定边栏（Logo + 菜单）、
// 顶部顶栏（面包屑 + 账号头像下拉）、主内容区；不做多标签页、折叠、移动页与页面标题。
export function OpsShell({ children }: { children: React.ReactNode }): React.ReactElement {
  const pathname = usePathname();
  const [role, setRole] = useState<PlatformRole | null>(currentOpsRole());

  // 登录态守卫：只接受平台令牌；刷新失败一律回 /ops/login（租户令牌进入 /ops 亦被拒）
  useEffect(() => {
    let cancelled = false;
    void (async () => {
      const ok = opsSession.get() !== null || (await refreshOpsSession());
      if (cancelled) {
        return;
      }
      if (!ok) {
        window.location.assign('/ops/login');
        return;
      }
      setRole(currentOpsRole());
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  async function handleLogout(): Promise<void> {
    try {
      await opsApi.POST('/api/v1/ops/auth/logout', {});
    } catch {
      // 退出失败也清本地会话，避免卡在后台
    }
    opsSession.clear();
    window.location.assign('/ops/login');
  }

  const items = visibleOpsNav(role);
  const current = findOpsNavByPath(pathname);
  const required = scopeForOpsPath(pathname);
  const allowed = required === null || role === null || hasPlatformScope(role, required);
  const username = currentOpsUsername();

  return (
    <ConfirmProvider>
      <div className="flex h-svh overflow-hidden bg-background">
        <aside className="flex w-56 shrink-0 flex-col border-r border-border bg-sidebar">
          <div className="flex h-12 items-center border-b border-border px-4 text-sm font-semibold">
            平台运营
          </div>
          <nav className="flex-1 space-y-1 overflow-y-auto p-2">
            {items.map((item) => {
              const active = pathname === item.href || pathname.startsWith(`${item.href}/`);
              return (
                <Link
                  key={item.href}
                  href={item.href}
                  aria-current={active ? 'page' : undefined}
                  className={cn(
                    'flex items-center gap-2 rounded-md px-2 py-2 text-sm text-muted-foreground transition-colors hover:bg-muted hover:text-foreground',
                    active && 'bg-muted text-foreground',
                  )}
                >
                  <item.icon className="size-4 shrink-0" />
                  <span className="truncate">{item.title}</span>
                </Link>
              );
            })}
          </nav>
        </aside>

        <div className="flex min-w-0 flex-1 flex-col">
          <header className="flex h-12 shrink-0 items-center justify-between gap-3 border-b border-border px-4">
            <div className="min-w-0 truncate text-sm text-muted-foreground">
              <Link href="/ops/tenants" className="hover:text-foreground">
                平台运营
              </Link>
              {current ? ` / ${current.title}` : null}
            </div>
            <div className="shrink-0">
              <DropdownMenu>
                <DropdownMenuTrigger aria-label="平台账号菜单">
                  <Avatar className="size-8 after:border-primary/20">
                    <AvatarFallback className="bg-primary/10 text-primary">
                      <UserSilhouetteIcon className="size-[18px]" />
                    </AvatarFallback>
                  </Avatar>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="end">
                  <DropdownMenuGroup>
                    <DropdownMenuLabel>{username ?? '平台账号'}</DropdownMenuLabel>
                  </DropdownMenuGroup>
                  <DropdownMenuSeparator />
                  <DropdownMenuItem onClick={() => void handleLogout()}>
                    <LogOutIcon className="mr-2 size-4" />
                    退出登录
                  </DropdownMenuItem>
                </DropdownMenuContent>
              </DropdownMenu>
            </div>
          </header>
          <main className="scroll-area min-w-0 flex-1 overflow-x-hidden overflow-y-auto p-7">
            {allowed ? (
              children
            ) : (
              <div className="rounded-lg border border-border bg-card p-6 text-sm text-muted-foreground">
                无权限访问该页面。
              </div>
            )}
          </main>
        </div>
      </div>
    </ConfirmProvider>
  );
}

// 平台登录页不使用此壳，但保持同样的退出按钮语义供测试复用
export function OpsLogoutButton(): React.ReactElement {
  return (
    <Button variant="outline" onClick={() => window.location.assign('/ops/login')}>
      退出
    </Button>
  );
}
