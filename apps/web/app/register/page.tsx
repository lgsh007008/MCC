'use client';

import { useState } from 'react';
import Link from 'next/link';
import { registerSchema } from '@mcc/shared';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { authSession } from '@/lib/auth/session';
import { api } from '@/lib/api';

// 自助注册页（product/账号与权限.md R-账号与权限-005 / design/账号与权限.md §9）：
// 企业名称 + 首管理员；成功后自动登录，按视口进入 /admin 或 /m。
// 确认密码只在本页校验，不提交服务端。
export default function RegisterPage(): React.ReactElement {
  const [companyName, setCompanyName] = useState('');
  const [username, setUsername] = useState('');
  const [phone, setPhone] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  async function handleSubmit(event: React.FormEvent<HTMLFormElement>): Promise<void> {
    event.preventDefault();
    setError(null);

    const parsed = registerSchema.safeParse({ companyName, username, phone, password });
    if (!parsed.success) {
      setError(parsed.error.issues[0]?.message ?? '输入不合法');
      return;
    }
    if (password !== confirmPassword) {
      setError('两次输入的密码不一致');
      return;
    }

    setSubmitting(true);
    try {
      const { data, error, response } = await api.POST('/api/v1/auth/register', {
        body: parsed.data,
      });
      if (response.ok && data) {
        authSession.set(data.accessToken, data.features, data.mustChangePassword);
        const narrow = window.matchMedia('(max-width: 767px)').matches;
        window.location.assign(narrow ? '/m' : '/admin');
        return;
      }
      // openapi-fetch 已消费错误响应体，必须读 error；再调 response.json() 会因 body 已用而丢失服务端提示
      const serverError = error as { message?: string } | undefined;
      setError(serverError?.message ?? '注册失败，请稍后重试');
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <main className="flex min-h-screen items-center justify-center bg-muted/40 p-6">
      <div className="w-full max-w-sm rounded-lg border border-border bg-card p-8">
        <h1 className="text-xl font-semibold">注册企业</h1>
        <p className="mt-1 text-sm text-muted-foreground">创建企业并成为管理员</p>

        <form className="mt-6 space-y-4" onSubmit={handleSubmit}>
          <div className="space-y-2">
            <Label htmlFor="companyName">企业名称</Label>
            <Input
              id="companyName"
              autoComplete="organization"
              value={companyName}
              onChange={(e) => setCompanyName(e.target.value)}
              placeholder="请输入企业名称"
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="username">管理员姓名</Label>
            <Input
              id="username"
              autoComplete="name"
              value={username}
              onChange={(e) => setUsername(e.target.value)}
              placeholder="请输入姓名"
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="phone">手机号</Label>
            <Input
              id="phone"
              type="tel"
              inputMode="numeric"
              autoComplete="tel"
              value={phone}
              onChange={(e) => setPhone(e.target.value)}
              placeholder="请输入 11 位手机号"
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="password">密码</Label>
            <Input
              id="password"
              type="password"
              autoComplete="new-password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder="至少 8 位"
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="confirmPassword">确认密码</Label>
            <Input
              id="confirmPassword"
              type="password"
              autoComplete="new-password"
              value={confirmPassword}
              onChange={(e) => setConfirmPassword(e.target.value)}
              placeholder="再次输入密码"
            />
          </div>

          {error ? <p className="text-sm text-destructive">{error}</p> : null}

          <Button type="submit" className="w-full" disabled={submitting}>
            {submitting ? '注册中…' : '注册并进入'}
          </Button>
        </form>

        <p className="mt-4 text-center text-sm text-muted-foreground">
          已有账号？{' '}
          <Link href="/login" className="text-primary underline-offset-4 hover:underline">
            返回登录
          </Link>
        </p>
      </div>
    </main>
  );
}
