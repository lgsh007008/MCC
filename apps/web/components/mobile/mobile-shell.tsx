'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { ArrowLeftIcon } from 'lucide-react';
import { hasScope, type Scope, type UserRole } from '@mcc/shared';
import { RoleProvider } from '@/components/auth/permission-context';
import { refreshSession } from '@/lib/api';
import { authSession, currentRole } from '@/lib/auth/session';

// 移动 Web 壳（design/平台布局.md §1.8；ADR-011）：与 PC 后台的 AdminShell 平行，
// 只保留顶部返回、单列内容与页面自带的底部操作条；不引入侧边栏 / 多标签页 / 面包屑。
// 根节点 data-mode="mobile" 挂载移动令牌作用域（适老化基线，不做用户开关）。

// 移动路由 → scope（与 PC 共用同一套权限，不按端拆分）
const MOBILE_MANAGE_PATH = /^\/m\/sale-orders\/(new|[^/]+\/edit)$/;
function scopeForMobilePath(pathname: string): Scope | null {
  if (MOBILE_MANAGE_PATH.test(pathname)) {
    return 'order:manage';
  }
  if (pathname.startsWith('/m/sale-orders')) {
    return 'order:view';
  }
  return null;
}

export function MobileShell({ children }: { children: React.ReactNode }): React.ReactElement {
  const pathname = usePathname();
  const [role, setRole] = useState<UserRole | null>(currentRole());

  // 登录态守卫：与 AdminShell 同口径，挂载后经 refresh（httpOnly Cookie）静默恢复；失败跳登录页
  useEffect(() => {
    let cancelled = false;
    void (async () => {
      const ok = authSession.get() !== null || (await refreshSession());
      if (cancelled) {
        return;
      }
      setRole(currentRole());
      if (!ok) {
        window.location.assign('/login');
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  const required = scopeForMobilePath(pathname);
  const allowed = required === null || role === null || hasScope(role, required);

  return (
    <RoleProvider role={role}>
      <div data-mode="mobile" className="min-h-svh bg-background text-base text-foreground">
        <div className="mx-auto min-h-svh w-full max-w-[560px] border-x border-border/60 bg-background">
          {allowed ? (
            children
          ) : (
            <p className="p-6 text-base text-muted-foreground">无权限访问该页面。</p>
          )}
        </div>
      </div>
    </RoleProvider>
  );
}

export function MobileHeader({
  title,
  backHref,
}: {
  title: string;
  backHref?: string;
}): React.ReactElement {
  return (
    <header className="sticky top-0 z-20 flex h-14 items-center gap-1 border-b border-border bg-background px-2">
      {backHref ? (
        <Link
          href={backHref}
          aria-label="返回"
          className="inline-flex h-11 min-w-11 items-center justify-center gap-1 rounded-md px-2 text-base text-muted-foreground hover:bg-muted hover:text-foreground"
        >
          <ArrowLeftIcon className="size-5" />
          <span>返回</span>
        </Link>
      ) : null}
      <h1 className="min-w-0 flex-1 truncate px-1 text-lg font-semibold">{title}</h1>
    </header>
  );
}

// 底部固定操作条：主操作整行大按钮；页面内容需自留底部间距（不遮挡最后一行内容）
export function MobileActionBar({ children }: { children: React.ReactNode }): React.ReactElement {
  return (
    <div className="fixed inset-x-0 bottom-0 z-30 border-t border-border bg-background/95 backdrop-blur">
      <div className="mx-auto flex w-full max-w-[560px] items-center gap-2 px-4 py-3">{children}</div>
    </div>
  );
}
