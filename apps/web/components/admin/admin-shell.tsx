'use client';

import { useEffect, useState } from 'react';
import { usePathname } from 'next/navigation';
import { changePasswordSchema } from '@mcc/shared';
import { Avatar, AvatarFallback } from '@/components/ui/avatar';
import { Button } from '@/components/ui/button';
import {
  Breadcrumb,
  BreadcrumbItem,
  BreadcrumbList,
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
  SidebarGroup,
  SidebarGroupLabel,
  SidebarHeader,
  SidebarInset,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
  SidebarProvider,
} from '@/components/ui/sidebar';
import { api, refreshSession } from '@/lib/api';
import { authSession } from '@/lib/auth/session';
import { findNavByPath, navGroups } from '@/lib/nav';

// 后台布局壳（design/平台布局.md §1）：经典三区——侧边栏 / 顶栏 / 主内容区。
// 业务页面只实现主内容区（children），不各自拼壳；路由与守卫结构见同文档 §1.2。
export function AdminShell({ children }: { children: React.ReactNode }): React.ReactElement {
  const pathname = usePathname();
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

  return (
    <SidebarProvider>
      <Sidebar collapsible="icon">
        <SidebarHeader className="border-b border-border">
          <span className="px-2 text-sm font-semibold">梅好木业</span>
        </SidebarHeader>
        <SidebarContent>
          {navGroups.map((group) => (
            <SidebarGroup key={group.label}>
              <SidebarGroupLabel>{group.label}</SidebarGroupLabel>
              <SidebarMenu>
                {group.items.map((item) => (
                  <SidebarMenuItem key={item.title}>
                    {item.pending ? (
                      <span className="flex items-center justify-between rounded-md px-2 py-1.5 text-sm text-muted-foreground/60">
                        {item.title}
                        {item.pendingBadge === false ? null : (
                          <span className="ml-2 shrink-0 rounded border border-border px-1 text-xs">
                            待建
                          </span>
                        )}
                      </span>
                    ) : (
                      <SidebarMenuButton
                        isActive={pathname === item.href}
                        render={<a href={item.href} />}
                      >
                        {item.title}
                      </SidebarMenuButton>
                    )}
                  </SidebarMenuItem>
                ))}
              </SidebarMenu>
            </SidebarGroup>
          ))}
        </SidebarContent>
      </Sidebar>

      <SidebarInset>
        <header className="flex h-14 shrink-0 items-center justify-between border-b border-border px-6">
          <Breadcrumb>
            <BreadcrumbList>
              <BreadcrumbItem>梅好木业</BreadcrumbItem>
              {current ? (
                <>
                  <BreadcrumbSeparator />
                  <BreadcrumbItem>{current.groupLabel}</BreadcrumbItem>
                  <BreadcrumbSeparator />
                  <BreadcrumbItem>{current.itemTitle}</BreadcrumbItem>
                </>
              ) : null}
            </BreadcrumbList>
          </Breadcrumb>

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
        </header>

        <main className="flex-1 overflow-y-auto p-6">{children}</main>
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