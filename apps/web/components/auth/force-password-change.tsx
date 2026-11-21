'use client';

import { useState } from 'react';
import { changePasswordSchema } from '@mcc/shared';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { api } from '@/lib/api';
import { authSession } from '@/lib/auth/session';

// 强制改密（ADR-015 / product/账号与权限.md R-账号与权限-001）：
// 管理员新建账号或重置密码后，首次登录必须先改密；弹窗不可关闭，服务端同时拦截业务接口。
export function ForcePasswordChangeDialog({
  open,
}: {
  open: boolean;
}): React.ReactElement {
  const [oldPassword, setOldPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  async function handleSubmit(event: React.FormEvent<HTMLFormElement>): Promise<void> {
    event.preventDefault();
    setError(null);
    const parsed = changePasswordSchema.safeParse({ oldPassword, newPassword });
    if (!parsed.success) {
      setError(parsed.error.issues[0]?.message ?? '输入不合法');
      return;
    }
    setSubmitting(true);
    try {
      const { response } = await api.POST('/api/v1/auth/change-password', { body: parsed.data });
      if (!response.ok) {
        const body = (await response.json().catch(() => null)) as { message?: string } | null;
        setError(body?.message ?? '修改失败，请稍后重试');
        return;
      }
      // 改密成功后旧会话已撤销，必须用新密码重新登录
      authSession.clear();
      window.location.assign('/login');
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={() => undefined}>
      <DialogContent showCloseButton={false} className="sm:max-w-[420px]">
        <DialogHeader>
          <DialogTitle>请先修改初始密码</DialogTitle>
          <DialogDescription>
            当前账号仍在使用管理员设置的初始密码。设置新密码后才能进入业务页面。
          </DialogDescription>
        </DialogHeader>
        <form className="space-y-3" onSubmit={handleSubmit}>
          <div className="space-y-2">
            <Label htmlFor="forceOldPassword">当前密码</Label>
            <Input
              id="forceOldPassword"
              type="password"
              autoComplete="current-password"
              value={oldPassword}
              onChange={(event) => setOldPassword(event.target.value)}
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="forceNewPassword">新密码（至少 8 位）</Label>
            <Input
              id="forceNewPassword"
              type="password"
              autoComplete="new-password"
              value={newPassword}
              onChange={(event) => setNewPassword(event.target.value)}
            />
          </div>
          {error ? <p className="text-sm text-destructive">{error}</p> : null}
          <DialogFooter>
            <Button type="submit" disabled={submitting}>
              {submitting ? '保存中…' : '修改并重新登录'}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
