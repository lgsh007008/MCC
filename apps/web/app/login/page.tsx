'use client';

import { useState } from 'react';
import Link from 'next/link';
import { loginSchema } from '@mcc/shared';
import { Eye, EyeOff } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { authSession } from '@/lib/auth/session';
import { api } from '@/lib/api';

// 登录页（product/账号与权限.md R-账号与权限-001）：手机号、密码（显示/隐藏切换）、登录按钮、记住登录。
// 纯组件拼装，不单列页面设计；页面归属账号与权限领域。
export default function LoginPage(): React.ReactElement {
  const [phone, setPhone] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [rememberMe, setRememberMe] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  async function handleSubmit(event: React.FormEvent<HTMLFormElement>): Promise<void> {
    event.preventDefault();
    setError(null);

    const parsed = loginSchema.safeParse({ phone, password, rememberMe });
    if (!parsed.success) {
      setError(parsed.error.issues[0]?.message ?? '输入不合法');
      return;
    }

    setSubmitting(true);
    try {
      const { data, error, response } = await api.POST('/api/v1/auth/login', {
        body: parsed.data,
      });
      if (response.ok && data) {
        authSession.set(data.accessToken, data.features, data.mustChangePassword);
        // 两端共用登录页：窄屏进移动 Web 入口，宽屏进包装设计（当前阶段 PC 默认落地页）
        const narrow = window.matchMedia('(max-width: 767px)').matches;
        window.location.assign(narrow ? '/m' : '/admin/packaging-design');
        return;
      }
      // openapi-fetch 已消费错误响应体，必须读 error；再调 response.json() 会因 body 已用而丢失服务端提示
      const serverError = error as { message?: string } | undefined;
      setError(serverError?.message ?? '登录失败，请稍后重试');
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <main className="flex min-h-screen items-center justify-center bg-muted/40 p-6">
      <div className="w-full max-w-sm rounded-lg border border-border bg-card p-8">
        <h1 className="text-xl font-semibold">登录</h1>
        <p className="mt-1 text-sm text-muted-foreground">梅好木业数字化系统</p>

        <form className="mt-6 space-y-4" onSubmit={handleSubmit}>
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
            <div className="relative">
              <Input
                id="password"
                type={showPassword ? 'text' : 'password'}
                autoComplete="current-password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="请输入密码"
                className="pr-10"
              />
              <Button
                type="button"
                variant="ghost"
                size="icon-sm"
                className="absolute inset-y-0 right-1 my-auto text-muted-foreground"
                aria-label={showPassword ? '隐藏密码' : '显示密码'}
                aria-pressed={showPassword}
                title={showPassword ? '隐藏密码' : '显示密码'}
                onClick={() => setShowPassword((v) => !v)}
              >
                {showPassword ? <EyeOff className="size-4" /> : <Eye className="size-4" />}
              </Button>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <Checkbox
              id="rememberMe"
              checked={rememberMe}
              onCheckedChange={(checked) => setRememberMe(checked === true)}
            />
            <Label htmlFor="rememberMe" className="text-sm">
              记住登录
            </Label>
          </div>

          <p className="text-xs text-muted-foreground">忘记密码请联系管理员重置。</p>

          {error ? <p className="text-sm text-destructive">{error}</p> : null}

          <Button type="submit" className="w-full" disabled={submitting}>
            {submitting ? '登录中…' : '登录'}
          </Button>
        </form>

        <p className="mt-4 text-center text-sm text-muted-foreground">
          还没有企业账号？{' '}
          <Link href="/register" className="text-primary underline-offset-4 hover:underline">
            注册企业
          </Link>
        </p>
      </div>
    </main>
  );
}