'use client';

import { Fragment, useEffect, useRef, useState } from 'react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { ChevronDownIcon, PanelLeftCloseIcon, PanelLeftOpenIcon } from 'lucide-react';
import { changePasswordSchema } from '@mcc/shared';
import { cn } from '@/lib/utils';
import { Avatar, AvatarFallback } from '@/components/ui/avatar';
import { Button } from '@/components/ui/button';
import {
  Breadcrumb,
  BreadcrumbItem,
  BreadcrumbLink,
  BreadcrumbList,
  BreadcrumbPage,
  BreadcrumbSeparator,
} from '@/components/ui/breadcrumb';
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
import { authSession } from '@/lib/auth/session';
import { findNavByPath, homeItem, navGroups } from '@/lib/nav';
import { ConfirmProvider } from '@/components/ui/confirm-dialog';
import { PageBreadcrumbProvider, usePageBreadcrumb } from './page-breadcrumb';
import { AppQueryProvider } from './query-provider';
import { TabBar, TabsProvider, useTabs } from './tabs';

// 后台布局壳（design/平台布局.md §1）：经典三区——侧边栏 / 顶栏 / 主内容区。
// 业务页面只实现主内容区（children），不各自拼壳；路由与守卫结构见同文档 §1.2。
// 顶栏两行：第一行多标签页 + 头像（design/平台布局.md §1.6），第二行折叠开关 + 面包屑；
// 面包屑最后一层（页面标识）由页面经 usePageCrumb 注入（design/平台布局.md §1.5）。
export function AdminShell({
  children,
  defaultSidebarOpen = true,
}: {
  children: React.ReactNode;
  defaultSidebarOpen?: boolean;
}): React.ReactElement {
  return (
    <AppQueryProvider>
      <PageBreadcrumbProvider>
        <TabsProvider>
          <ConfirmProvider>
            <AdminShellInner defaultSidebarOpen={defaultSidebarOpen}>{children}</AdminShellInner>
          </ConfirmProvider>
        </TabsProvider>
      </PageBreadcrumbProvider>
    </AppQueryProvider>
  );
}

// 侧边栏折叠开关（product/平台布局.md 整体布局）：置于侧边栏底部；展开态显示文字，折叠态只显示图标
function SidebarCollapseButton(): React.ReactElement {
  const { state, toggleSidebar } = useSidebar();
  const open = state !== 'collapsed';
  return (
    <Button
      type="button"
      variant="ghost"
      className="w-full justify-start gap-2 text-muted-foreground"
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
      <span className="group-data-[collapsible=icon]:hidden">收起</span>
    </Button>
  );
}

function AdminShellInner({
  children,
  defaultSidebarOpen,
}: {
  children: React.ReactNode;
  defaultSidebarOpen: boolean;
}): React.ReactElement {
  const pathname = usePathname();
  const { reset: resetTabs } = useTabs();
  const mainRef = useRef<HTMLElement>(null);
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
  const pageCrumbs = usePageBreadcrumb()?.crumbs ?? [];

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
  // 分组树状折叠（design/平台布局.md §1.3）：默认全部展开
  const [collapsedGroups, setCollapsedGroups] = useState<Set<string>>(new Set());
  const isGroupCollapsed = (label: string): boolean => collapsedGroups.has(label);
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

  return (
    <SidebarProvider defaultOpen={defaultSidebarOpen} className="h-svh overflow-hidden">
      <Sidebar collapsible="icon">
        <SidebarHeader className="border-b border-border">
          <span className="px-2 text-sm font-semibold">
            <span className="group-data-[collapsible=icon]:hidden">梅好木业</span>
            <span className="hidden group-data-[collapsible=icon]:inline">木</span>
          </span>
        </SidebarHeader>
        <SidebarContent>
          <SidebarMenu>
            <SidebarMenuItem>
              <SidebarMenuButton
                isActive={pathname === homeItem.href}
                title={homeItem.title}
                render={<Link href={homeItem.href ?? '#'} aria-label={homeItem.title} />}
              >
                <homeItem.icon />
                <span className="group-data-[collapsible=icon]:hidden">{homeItem.title}</span>
              </SidebarMenuButton>
            </SidebarMenuItem>
          </SidebarMenu>
          {navGroups.map((group) => {
            const collapsed = isGroupCollapsed(group.label);
            return (
              <SidebarGroup key={group.label}>
                <SidebarGroupLabel
                  render={
                    <button
                      type="button"
                      aria-expanded={!collapsed}
                      className="flex h-8 w-full items-center gap-2 rounded-md px-2 text-xs font-medium text-sidebar-foreground/70 transition-colors hover:text-sidebar-foreground group-data-[collapsible=icon]:pointer-events-none"
                      onClick={() => toggleGroup(group.label)}
                    >
                      <group.icon className="size-4 shrink-0" />
                      <span className="flex-1 truncate text-left">{group.label}</span>
                      <ChevronDownIcon
                        className={cn('size-3.5 shrink-0 transition-transform', collapsed && '-rotate-90')}
                      />
                    </button>
                  }
                />
                {/* 图标态：组图标按钮（展开态隐藏），点击折叠/展开该组 */}
                <SidebarMenu className="hidden group-data-[collapsible=icon]:flex">
                  <SidebarMenuItem>
                    <SidebarMenuButton
                      title={group.label}
                      aria-expanded={!collapsed}
                      onClick={() => toggleGroup(group.label)}
                    >
                      <group.icon />
                    </SidebarMenuButton>
                  </SidebarMenuItem>
                </SidebarMenu>
                {!collapsed ? (
                  <SidebarMenu>
                    {group.items.map((item) => (
                      <SidebarMenuItem
                        key={item.title}
                        className="relative group-data-[collapsible=icon]:pl-2"
                      >
                        {/* 折叠为图标栏时的树状结构线：上半竖线 + 横向支线，父级 = 分组图标 */}
                        <span
                          aria-hidden
                          className="pointer-events-none absolute left-0 top-0 hidden h-1/2 w-px bg-sidebar-foreground/30 group-data-[collapsible=icon]:block"
                        />
                        <span
                          aria-hidden
                          className="pointer-events-none absolute left-0 top-1/2 hidden h-px w-2 bg-sidebar-foreground/30 group-data-[collapsible=icon]:block"
                        />
                        {item.pending ? (
                          <span className="flex items-center justify-between rounded-md px-2 py-1.5 text-sm text-muted-foreground/60">
                            <span className="flex items-center gap-2">
                              <item.icon className="size-4" />
                              <span className="group-data-[collapsible=icon]:hidden">{item.title}</span>
                            </span>
                            {item.pendingBadge === false ? null : (
                              <span className="ml-2 shrink-0 rounded border border-border px-1 text-xs group-data-[collapsible=icon]:hidden">
                                待建
                              </span>
                            )}
                          </span>
                        ) : (
                          <SidebarMenuButton
                            isActive={
                              item.href
                                ? pathname === item.href || pathname.startsWith(`${item.href}/`)
                                : false
                            }
                            title={item.title}
                            render={<Link href={item.href ?? '#'} aria-label={item.title} />}
                          >
                            <item.icon />
                            <span className="group-data-[collapsible=icon]:hidden">{item.title}</span>
                          </SidebarMenuButton>
                        )}
                      </SidebarMenuItem>
                    ))}
                  </SidebarMenu>
                ) : null}
              </SidebarGroup>
            );
          })}
        </SidebarContent>
        <SidebarFooter className="border-t border-border p-2">
          <SidebarCollapseButton />
        </SidebarFooter>
      </Sidebar>

      <SidebarInset>
        <header className="min-w-0 w-full shrink-0 overflow-hidden border-b border-border">
          {/* 第一行：多标签页 + 账号头像（design/平台布局.md §1.6） */}
          <div className="flex h-12 min-w-0 items-center justify-between gap-3 px-4">
            <TabBar />
            <div className="shrink-0">
              <DropdownMenu>
                <DropdownMenuTrigger>
                  <Avatar className="size-8">
                    <AvatarFallback>销</AvatarFallback>
                  </Avatar>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="end">
                  <DropdownMenuGroup>
                    <DropdownMenuLabel>账号</DropdownMenuLabel>
                  </DropdownMenuGroup>
                  <DropdownMenuSeparator />
                  <DropdownMenuItem onClick={() => setPwdOpen(true)}>修改密码</DropdownMenuItem>
                  <DropdownMenuItem onClick={() => void handleLogout()}>退出登录</DropdownMenuItem>
                </DropdownMenuContent>
              </DropdownMenu>
            </div>
          </div>

          {/* 第二行：面包屑（窄屏截断，不撑宽页面） */}
          <div className="flex h-10 min-w-0 items-center gap-2 overflow-hidden border-t border-border/60 px-4 [&_li]:min-w-0 [&_li]:truncate [&_ol]:flex-nowrap [&_ol]:overflow-hidden">
            <Breadcrumb>
              <BreadcrumbList>
                {pathname === homeItem.href ? (
                  <BreadcrumbItem title="首页">
                    <BreadcrumbPage>首页</BreadcrumbPage>
                  </BreadcrumbItem>
                ) : (
                  <>
                    <BreadcrumbItem title="首页">
                      <BreadcrumbLink render={<Link href="/admin" />}>首页</BreadcrumbLink>
                    </BreadcrumbItem>
                    {current && current.groupLabel ? (
                      <>
                        <BreadcrumbSeparator />
                        <BreadcrumbItem title={current.groupLabel}>
                          {current.itemTitle ? (
                            current.groupLabel
                          ) : (
                            <BreadcrumbPage>{current.groupLabel}</BreadcrumbPage>
                          )}
                        </BreadcrumbItem>
                      </>
                    ) : null}
                    {current && current.itemTitle ? (
                      <>
                        <BreadcrumbSeparator />
                        <BreadcrumbItem title={current.itemTitle}>
                          {pathname === current.itemHref ? (
                            <BreadcrumbPage>{current.itemTitle}</BreadcrumbPage>
                          ) : (
                            <BreadcrumbLink render={<Link href={current.itemHref ?? '/admin'} />}>
                              {current.itemTitle}
                            </BreadcrumbLink>
                          )}
                        </BreadcrumbItem>
                      </>
                    ) : null}
                    {pageCrumbs.map((crumb, index) => {
                      const isLast = index === pageCrumbs.length - 1;
                      return (
                        <Fragment key={`${crumb.title}-${index}`}>
                          <BreadcrumbSeparator />
                          <BreadcrumbItem title={crumb.title}>
                            {isLast ? (
                              <BreadcrumbPage>{crumb.title}</BreadcrumbPage>
                            ) : crumb.href ? (
                              <BreadcrumbLink render={<Link href={crumb.href} />}>
                                {crumb.title}
                              </BreadcrumbLink>
                            ) : (
                              <span>{crumb.title}</span>
                            )}
                          </BreadcrumbItem>
                        </Fragment>
                      );
                    })}
                  </>
                )}
              </BreadcrumbList>
            </Breadcrumb>
          </div>
        </header>

        <main ref={mainRef} className="scroll-area min-w-0 flex-1 overflow-x-hidden overflow-y-auto p-7">{children}</main>
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
    </SidebarProvider>
  );
}