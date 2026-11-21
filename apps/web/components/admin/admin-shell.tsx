﻿'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import Image from 'next/image';
import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import { ChevronDownIcon, PanelLeftCloseIcon, PanelLeftOpenIcon } from 'lucide-react';
import { ROLE_LABELS, changePasswordSchema, hasScope, type FeatureCode, type UserRole } from '@mcc/shared';
import { cn } from '@/lib/utils';
import { Avatar, AvatarFallback } from '@/components/ui/avatar';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuGroup,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
  Sidebar,
  SidebarContent,
  SidebarFooter,
  SidebarGroup,
  SidebarGroupLabel,
  SidebarHeader,
  SidebarInset,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
  SidebarProvider,
  useSidebar,
} from '@/components/ui/sidebar';
import { api, refreshSession } from '@/lib/api';
import { authSession, currentFeatures, currentRole, currentUsername } from '@/lib/auth/session';
import {
  featureForPath,
  findNavByPath,
  scopeForPath,
  visibleNavGroups,
  type NavGroup,
} from '@/lib/nav';
import { RoleProvider } from '@/components/auth/permission-context';
import { ForcePasswordChangeDialog } from '@/components/auth/force-password-change';
import { ConfirmProvider } from '@/components/ui/confirm-dialog';
import { PageBreadcrumbProvider } from './page-breadcrumb';
import { sidebarItemFocusClass, sidebarItemStateClass } from './sidebar-item-state';
import { SidebarPeek } from './sidebar-peek';
import { TabBar, TabsProvider, useTabs } from './tabs';

// 后台布局壳（design/平台布局.md §1）：经典三区——侧边栏 / 顶栏 / 主内容区。
// 业务页面只实现主内容区（children），不各自拼壳；路由与守卫结构见同文档 §1.2。
// 顶栏单行：多标签页 + 头像（design/平台布局.md §1.6）。
// 面包屑界面暂不渲染（design/平台布局.md §1.5）；页面经 usePageCrumb 注入的层级
// 仍保留，供标签页标题拼接，恢复时只需加回第二行渲染。
export function AdminShell({
  children,
  defaultSidebarOpen = true,
}: {
  children: React.ReactNode;
  defaultSidebarOpen?: boolean;
}): React.ReactElement {
  return (
    <PageBreadcrumbProvider>
      <TabsProvider>
        <ConfirmProvider>
          <AdminShellInner defaultSidebarOpen={defaultSidebarOpen}>{children}</AdminShellInner>
        </ConfirmProvider>
      </TabsProvider>
    </PageBreadcrumbProvider>
  );
}

// 平台全局侧栏折叠开关（design/平台布局.md §1.5）：底部全宽行，PanelLeftClose/Open + 收起 / 展开文字；
// 整行可点，折叠态文字隐藏；图标与工作台边缘双箭头把手区分。
function SidebarCollapseButton(): React.ReactElement {
  const { state, toggleSidebar } = useSidebar();
  const open = state !== 'collapsed';
  return (
    <Button
      type="button"
      variant="ghost"
      className="w-full justify-start gap-2 text-muted-foreground group-data-[collapsible=icon]:justify-center group-data-[collapsible=icon]:gap-1 group-data-[collapsible=icon]:px-1"
      aria-label={open ? '收起侧边栏' : '展开侧边栏'}
      aria-expanded={open}
      title={open ? '收起侧边栏' : '展开侧边栏'}
      onClick={toggleSidebar}
    >
      {open ? (
        <PanelLeftCloseIcon className="size-4 shrink-0" />
      ) : (
        <PanelLeftOpenIcon className="size-4 shrink-0" />
      )}
      <span className="text-xs">{open ? '收起' : '展开'}</span>
    </Button>
  );
}

function railButtonClass(selected: boolean, open = false): string {
  return cn(
    'flex w-full flex-col items-center gap-1 rounded-md px-1 py-1.5 text-[11px] leading-none transition-colors',
    sidebarItemStateClass({ selected, open }),
    sidebarItemFocusClass,
  );
}

function RailGroupButton({
  group,
  selected,
  open,
  buttonRef,
  onClick,
  onPointerEnter,
  onPointerLeave,
}: {
  group: NavGroup;
  selected: boolean;
  open: boolean;
  buttonRef: (node: HTMLButtonElement | null) => void;
  onClick: (event: React.MouseEvent<HTMLButtonElement>) => void;
  onPointerEnter: () => void;
  onPointerLeave: () => void;
}): React.ReactElement {
  return (
    <button
      ref={buttonRef}
      type="button"
      data-sidebar-peek-trigger
      aria-haspopup="true"
      aria-expanded={open}
      aria-controls={open ? 'sidebar-peek-panel' : undefined}
      title={group.label}
      onClick={onClick}
      onPointerEnter={onPointerEnter}
      onPointerLeave={onPointerLeave}
      className={railButtonClass(selected, open && !selected)}
    >
      <span className="flex size-8 items-center justify-center">
        <group.icon className="size-4" />
      </span>
      <span className="w-full truncate text-center">{group.label}</span>
    </button>
  );
}

// 折叠态侧栏 + 当前分组悬浮层（product/平台布局.md R-平台布局-001 /
// design/平台布局.md §1.3 / §1.5）。展开态仍是原来的完整菜单树。
function AdminSidebar({
  groups,
  currentGroupLabel,
  currentHref,
}: {
  groups: NavGroup[];
  currentGroupLabel: string | null;
  currentHref?: string;
}): React.ReactElement {
  const pathname = usePathname();
  const { state, isMobile } = useSidebar();
  const sidebarCollapsed = state === 'collapsed';
  const [collapsedGroups, setCollapsedGroups] = useState<Set<string>>(new Set());
  const [peekLabel, setPeekLabel] = useState<string | null>(null);
  const [peekPinned, setPeekPinned] = useState(false);
  const closeTimer = useRef<number | null>(null);
  const panelRef = useRef<HTMLDivElement>(null);
  const groupButtonRefs = useRef(new Map<string, HTMLButtonElement>());
  const peekGroup = groups.find((group) => group.label === peekLabel) ?? null;
  const peekOpen = peekGroup !== null;

  const clearCloseTimer = useCallback((): void => {
    if (closeTimer.current !== null) {
      window.clearTimeout(closeTimer.current);
      closeTimer.current = null;
    }
  }, []);

  const closePeek = useCallback((): void => {
    clearCloseTimer();
    setPeekLabel(null);
    setPeekPinned(false);
  }, [clearCloseTimer]);

  const scheduleClosePeek = useCallback((): void => {
    if (peekPinned) {
      return;
    }
    clearCloseTimer();
    closeTimer.current = window.setTimeout(() => {
      setPeekLabel(null);
      closeTimer.current = null;
    }, 180);
  }, [clearCloseTimer, peekPinned]);

  const openPeek = useCallback(
    (label: string): void => {
      clearCloseTimer();
      setPeekLabel(label);
    },
    [clearCloseTimer],
  );

  const toggleGroup = (label: string): void => {
    setCollapsedGroups((prev) => {
      const next = new Set(prev);
      if (next.has(label)) {
        next.delete(label);
      } else {
        next.add(label);
      }
      return next;
    });
  };

  const handleGroupClick = (group: NavGroup, event: React.MouseEvent<HTMLButtonElement>): void => {
    if (!sidebarCollapsed) {
      toggleGroup(group.label);
      return;
    }
    if (peekPinned && peekLabel === group.label) {
      closePeek();
      return;
    }
    openPeek(group.label);
    setPeekPinned(true);
    if (event.detail === 0) {
      window.setTimeout(() => {
        panelRef.current?.querySelector<HTMLAnchorElement>('a')?.focus();
      }, 0);
    }
  };

  useEffect(() => {
    closePeek();
  }, [pathname, closePeek]);

  useEffect(() => {
    if (!sidebarCollapsed || isMobile) {
      closePeek();
    }
  }, [sidebarCollapsed, isMobile, closePeek]);

  useEffect(() => {
    return () => {
      clearCloseTimer();
    };
  }, [clearCloseTimer]);

  useEffect(() => {
    if (!peekOpen) {
      return;
    }
    const onKeyDown = (event: KeyboardEvent): void => {
      if (event.key !== 'Escape') {
        return;
      }
      const label = peekLabel;
      closePeek();
      if (label) {
        window.setTimeout(() => {
          groupButtonRefs.current.get(label)?.focus();
        }, 0);
      }
    };
    const onPointerDown = (event: PointerEvent): void => {
      const target = event.target;
      if (!(target instanceof Element)) {
        return;
      }
      if (panelRef.current?.contains(target) || target.closest('[data-sidebar-peek-trigger]')) {
        return;
      }
      closePeek();
    };
    window.addEventListener('keydown', onKeyDown);
    document.addEventListener('pointerdown', onPointerDown);
    return () => {
      window.removeEventListener('keydown', onKeyDown);
      document.removeEventListener('pointerdown', onPointerDown);
    };
  }, [peekOpen, peekLabel, closePeek]);

  return (
    <>
      <Sidebar collapsible="icon">
        <SidebarHeader className="h-14 flex-row items-center border-b border-border px-3 group-data-[collapsible=icon]:justify-center group-data-[collapsible=icon]:px-0">
          <Link
            href="/admin/packaging-design"
            aria-label="梅好木业"
            title="梅好木业"
            className="flex size-8 items-center justify-center rounded-md transition-opacity hover:opacity-80 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-sidebar-ring focus-visible:ring-inset"
          >
            <Image
              src="/icon.svg"
              alt="梅好木业"
              width={28}
              height={28}
              unoptimized
              className="size-7"
            />
          </Link>
        </SidebarHeader>
        <SidebarContent>
          {sidebarCollapsed ? (
            <SidebarMenu className="gap-0.5 px-1 py-2">
              {groups.map((group) => (
                <SidebarMenuItem key={group.label}>
                  <RailGroupButton
                    group={group}
                    selected={currentGroupLabel === group.label}
                    open={peekLabel === group.label}
                    buttonRef={(node) => {
                      if (node) {
                        groupButtonRefs.current.set(group.label, node);
                      } else {
                        groupButtonRefs.current.delete(group.label);
                      }
                    }}
                    onClick={(event) => handleGroupClick(group, event)}
                    onPointerEnter={() => {
                      if (!isMobile) {
                        openPeek(group.label);
                      }
                    }}
                    onPointerLeave={scheduleClosePeek}
                  />
                </SidebarMenuItem>
              ))}
            </SidebarMenu>
          ) : (
            <>
              {groups.map((group) => {
                const collapsed = collapsedGroups.has(group.label);
                const selectedParent = collapsed && currentGroupLabel === group.label;
                return (
                  <SidebarGroup key={group.label}>
                    <SidebarGroupLabel
                      render={
                        <button
                          type="button"
                          aria-expanded={!collapsed}
                          className={cn(
                            'flex h-8 w-full items-center gap-2 rounded-md px-2 text-xs transition-colors',
                            sidebarItemStateClass({ selected: selectedParent }),
                            sidebarItemFocusClass,
                          )}
                          onClick={() => toggleGroup(group.label)}
                        >
                          <group.icon className="size-4 shrink-0" />
                          <span className="flex-1 truncate text-left">{group.label}</span>
                          <ChevronDownIcon
                            className={cn(
                              'size-3.5 shrink-0 transition-transform',
                              collapsed && '-rotate-90',
                            )}
                          />
                        </button>
                      }
                    />
                    {!collapsed ? (
                      <SidebarMenu>
                        {group.items.map((item) => (
                          <SidebarMenuItem key={item.title}>
                            <SidebarMenuButton
                              isActive={currentHref === item.href}
                              className="focus-visible:ring-inset"
                              title={item.title}
                              render={<Link href={item.href ?? '#'} aria-label={item.title} />}
                            >
                              <item.icon />
                              <span>{item.title}</span>
                            </SidebarMenuButton>
                          </SidebarMenuItem>
                        ))}
                      </SidebarMenu>
                    ) : null}
                  </SidebarGroup>
                );
              })}
            </>
          )}
        </SidebarContent>
        <SidebarFooter className="border-t border-border p-2">
          <SidebarCollapseButton />
        </SidebarFooter>
      </Sidebar>
      <SidebarPeek
        group={peekGroup}
        currentHref={currentHref}
        panelRef={panelRef}
        onPointerEnter={clearCloseTimer}
        onPointerLeave={scheduleClosePeek}
        onNavigate={closePeek}
      />
    </>
  );
}

function NoPermission(): React.ReactElement {
  return (
    <div className="rounded-lg border border-border bg-card p-6 text-sm text-muted-foreground">
      无权限访问该页面。
    </div>
  );
}

// 进入包装设计工作台时把平台侧栏折叠为图标栏（design/平台布局.md §1.5 / design/包装设计.md §9.2）：
// 只沿平台自身的 useSidebar 状态、图标与宽度动画折叠一次；用户可手动展开，
// 工作台内部路由切换（/new → /[id]）不会再次折叠。
function WorkbenchSidebarAutoCollapse(): null {
  const pathname = usePathname();
  const { isMobile, setOpen, setOpenMobile } = useSidebar();
  const lastArea = useRef<'workbench' | 'other' | null>(null);
  const inWorkbench = /^\/admin\/packaging-design\/(?:new|[0-9a-fA-F-]{36})$/.test(pathname);

  useEffect(() => {
    const area = inWorkbench ? 'workbench' : 'other';
    if (lastArea.current === area) {
      return;
    }
    lastArea.current = area;
    if (area !== 'workbench') {
      return;
    }
    if (isMobile) {
      setOpenMobile(false);
      return;
    }
    setOpen(false);
  }, [inWorkbench, isMobile, setOpen, setOpenMobile]);

  return null;
}

function AdminShellInner({
  children,
  defaultSidebarOpen,
}: {
  children: React.ReactNode;
  defaultSidebarOpen: boolean;
}): React.ReactElement {
  const pathname = usePathname();
  const router = useRouter();
  const { reset: resetTabs } = useTabs();
  const mainRef = useRef<HTMLElement>(null);
  const [role, setRole] = useState<UserRole | null>(currentRole());
  const [features, setFeatures] = useState<FeatureCode[] | null>(currentFeatures());
  const [mustChangePassword, setMustChangePassword] = useState(
    authSession.mustChangePassword(),
  );
  // 每个标签记住主内容区滚动位置，切回时恢复（design/平台布局.md §1.6）
  const scrollPositions = useRef(new Map<string, number>());
  const [pwdOpen, setPwdOpen] = useState(false);
  const [pwdError, setPwdError] = useState<string | null>(null);
  const [pwdSubmitting, setPwdSubmitting] = useState(false);
  const [oldPassword, setOldPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');

  // 登录态守卫：挂载即经 refresh（httpOnly Cookie）静默恢复；
  // 恢复失败且位于后台路由时跳登录页（product/平台布局.md R-平台布局-001 使用端）。
  useEffect(() => {
    let cancelled = false;
    void (async () => {
      const ok = authSession.get() !== null || (await refreshSession());
      if (cancelled) {
        return;
      }
      setRole(currentRole());
      setFeatures(currentFeatures());
      setMustChangePassword(authSession.mustChangePassword());
      if (!ok && window.location.pathname.startsWith('/admin')) {
        window.location.assign('/login');
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  async function handleLogout(): Promise<void> {
    await api.POST('/api/v1/auth/logout', {});
    authSession.clear();
    // 标签随会话清空（product/平台布局.md 多标签页）
    resetTabs();
    window.location.assign('/login');
  }

  async function handleChangePassword(event: React.FormEvent<HTMLFormElement>): Promise<void> {
    event.preventDefault();
    setPwdError(null);
    const parsed = changePasswordSchema.safeParse({ oldPassword, newPassword });
    if (!parsed.success) {
      setPwdError(parsed.error.issues[0]?.message ?? '输入不合法');
      return;
    }
    setPwdSubmitting(true);
    try {
      const { response } = await api.POST('/api/v1/auth/change-password', { body: parsed.data });
      if (response.ok) {
        // 改密成功后该账号全部会话已被撤销，需重新登录
        authSession.clear();
        resetTabs();
        window.location.assign('/login');
        return;
      }
      const body = (await response.json().catch(() => null)) as { message?: string } | null;
      setPwdError(body?.message ?? '修改失败，请稍后重试');
    } finally {
      setPwdSubmitting(false);
    }
  }

  const current = findNavByPath(pathname);
  const groups = visibleNavGroups(role, features);
  const username = currentUsername();
  // 包装设计工作台占满主内容区（design/包装设计.md §9.1 / design/平台布局.md §1.5）；
  // 报告页与方案库仍按常规页面边距与滚动。
  const fullBleed = /^\/admin\/packaging-design\/(?:new|[0-9a-fA-F-]{36})$/.test(pathname);
  // 路由裁剪：无权限 / 未开通功能时显示统一提示，不渲染页面内容（服务端守卫仍是最终边界）
  const requiredScope = scopeForPath(pathname);
  const requiredFeature = featureForPath(pathname);
  const allowed =
    (requiredScope === null || role === null || hasScope(role, requiredScope)) &&
    (requiredFeature === null || features === null || features.includes(requiredFeature));

  // 滚动位置：路径变化后恢复该标签上次的位置；滚动时持续记录当前路径的位置
  useEffect(() => {
    const el = mainRef.current;
    if (!el) {
      return;
    }
    const target = scrollPositions.current.get(pathname) ?? 0;
    const raf = requestAnimationFrame(() => {
      el.scrollTop = target;
    });
    return () => cancelAnimationFrame(raf);
  }, [pathname]);

  useEffect(() => {
    const el = mainRef.current;
    if (!el) {
      return;
    }
    const onScroll = (): void => {
      scrollPositions.current.set(pathname, el.scrollTop);
    };
    el.addEventListener('scroll', onScroll, { passive: true });
    return () => el.removeEventListener('scroll', onScroll);
  }, [pathname]);
  return (
    <RoleProvider role={role}>
      <SidebarProvider defaultOpen={defaultSidebarOpen} className="h-svh overflow-hidden">
      <WorkbenchSidebarAutoCollapse />
      <AdminSidebar
        groups={groups}
        currentGroupLabel={current?.groupLabel ?? null}
        currentHref={current?.itemHref}
      />

      <SidebarInset>
        <header className="min-w-0 w-full shrink-0 overflow-hidden border-b border-border">
          {/* 第一行：多标签页 + 账号头像（design/平台布局.md §1.6） */}
          <div className="flex h-12 min-w-0 items-center justify-between gap-3 px-4">
            <TabBar />
            <div className="shrink-0">
              <DropdownMenu>
                <DropdownMenuTrigger aria-label="账号菜单">
                  <Avatar className="size-8">
                    <AvatarFallback>销</AvatarFallback>
                  </Avatar>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="end">
                  <DropdownMenuGroup>
                    <DropdownMenuLabel>
                      {username ? `${username}${role ? ` · ${ROLE_LABELS[role]}` : ''}` : '账号'}
                    </DropdownMenuLabel>
                  </DropdownMenuGroup>
                  <DropdownMenuSeparator />
                  <DropdownMenuItem onClick={() => setPwdOpen(true)}>修改密码</DropdownMenuItem>
                  {hasScope(role, 'account:manage') ? (
                    <DropdownMenuItem onClick={() => router.push('/admin/users')}>
                      账号管理
                    </DropdownMenuItem>
                  ) : null}
                  {hasScope(role, 'audit:view') &&
                  (features === null || features.includes('audit')) ? (
                    <DropdownMenuItem onClick={() => router.push('/admin/audit-logs')}>
                      审计日志
                    </DropdownMenuItem>
                  ) : null}
                  <DropdownMenuItem onClick={() => void handleLogout()}>退出登录</DropdownMenuItem>
                </DropdownMenuContent>
              </DropdownMenu>
            </div>
          </div>

        </header>

        <main
          ref={mainRef}
          className={cn(
            'scroll-area min-w-0 flex-1 overflow-x-hidden',
            fullBleed ? 'overflow-hidden p-0' : 'overflow-y-auto p-7',
          )}
        >
          {allowed ? children : <NoPermission />}
        </main>
      </SidebarInset>

      <Dialog open={pwdOpen} onOpenChange={setPwdOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>修改密码</DialogTitle>
            <DialogDescription>修改后全部会话将失效，需重新登录。</DialogDescription>
          </DialogHeader>
          <form className="space-y-4" onSubmit={handleChangePassword}>
            <div className="space-y-2">
              <Label htmlFor="oldPassword">旧密码</Label>
              <Input
                id="oldPassword"
                type="password"
                autoComplete="current-password"
                value={oldPassword}
                onChange={(e) => setOldPassword(e.target.value)}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="newPassword">新密码（至少 8 位）</Label>
              <Input
                id="newPassword"
                type="password"
                autoComplete="new-password"
                value={newPassword}
                onChange={(e) => setNewPassword(e.target.value)}
              />
            </div>
            {pwdError ? <p className="text-sm text-destructive">{pwdError}</p> : null}
            <DialogFooter>
              <Button type="button" variant="outline" onClick={() => setPwdOpen(false)}>
                取消
              </Button>
              <Button type="submit" disabled={pwdSubmitting}>
                {pwdSubmitting ? '提交中…' : '确认修改'}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
      <ForcePasswordChangeDialog open={mustChangePassword} />
      </SidebarProvider>
    </RoleProvider>
  );
}