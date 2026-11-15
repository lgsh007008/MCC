'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { platformLoginSchema } from '@mcc/shared';
import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { opsApi } from '@/lib/ops/api';
import { opsSession } from '@/lib/ops/session';

// 平台运营登录页（design/账号与权限.md §7）：独立入口 /ops/login，与租户登录互不通用。
export default function OpsLoginPage(): React.ReactElement {
  const router = useRouter();
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [rememberMe, setRememberMe] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  async function handleSubmit(event: React.FormEvent<HTMLFormElement>): Promise<void> {
    event.preventDefault();
    setError(null);
    const parsed = platformLoginSchema.safeParse({ username, password, rememberMe });
    if (!parsed.success) {
      setError(parsed.error.issues[0]?.message ?? '输入不合法');
      return;
    }
    setSubmitting(true);
    try {
      const { data, response } = await opsApi.POST('/api/v1/ops/auth/login', {
        body: parsed.data,
      });
      if (response.ok && data) {
        opsSession.set(data.accessToken);
        router.replace('/ops/tenants');
        return;
      }
      const body = (await response.json().catch(() => null)) as { message?: string } | null;
      setError(body?.message ?? '登录失败，请稍后重试');
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <main className="flex min-h-screen items-center justify-center bg-muted/40 p-6">
      <div className="w-full max-w-sm rounded-lg border border-border bg-card p-8">
        <h1 className="text-xl font-semibold">平台运营登录</h1>
        <p className="mt-1 text-sm text-muted-foreground">梅好木业数字化系统 · 运营后台</p>

        <form className="mt-6 space-y-4" onSubmit={handleSubmit}>
          <div className="space-y-2">
            <Label htmlFor="opsUsername">平台账号</Label>
            <Input
              id="opsUsername"
              autoComplete="username"
              value={username}
              onChange={(e) => setUsername(e.target.value)}
              placeholder="请输入平台账号"
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="opsPassword">密码</Label>
            <Input
              id="opsPassword"
              type="password"
              autoComplete="current-password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder="请输入密码"
            />
          </div>
          <div className="flex items-center gap-2">
            <Checkbox
              id="opsRememberMe"
              checked={rememberMe}
              onCheckedChange={(checked) => setRememberMe(checked === true)}
            />
            <Label htmlFor="opsRememberMe" className="text-sm">
              记住登录
            </Label>
          </div>
          {error ? <p className="text-sm text-destructive">{error}</p> : null}
          <Button type="submit" className="w-full" disabled={submitting}>
            {submitting ? '登录中…' : '登录'}
          </Button>
        </form>
      </div>
    </main>
  );
}
