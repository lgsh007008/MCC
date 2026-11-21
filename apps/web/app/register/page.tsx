'use client';

import * as React from 'react';
import Link from 'next/link';
import { registerSchema } from '@mcc/shared';
import { Eye, EyeOff } from 'lucide-react';
import { AuthShell } from '@/components/auth/auth-shell';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { authSession } from '@/lib/auth/session';
import { api } from '@/lib/api';

// 自助注册页（product/账号与权限.md R-账号与权限-005 / design/账号与权限.md §7）：
// 与登录页共用 AuthShell；企业名称 + 首管理员；成功后自动登录并按视口分流。
// 确认密码只在本页校验，不提交服务端。
export default function RegisterPage(): React.ReactElement {
  const [companyName, setCompanyName] = React.useState('');
  const [username, setUsername] = React.useState('');
  const [phone, setPhone] = React.useState('');
  const [password, setPassword] = React.useState('');
  const [confirmPassword, setConfirmPassword] = React.useState('');
  const [showPassword, setShowPassword] = React.useState(false);
  const [showConfirmPassword, setShowConfirmPassword] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);
  const [submitting, setSubmitting] = React.useState(false);

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
    <AuthShell
      title="注册企业"
      subtitle="创建企业并成为管理员"
      asideTitle="注册后，直接开始设计。"
      asideDescription="注册即开通标准版企业与管理员账号；登录后进入包装设计工作台，尺寸、图纸与料单都在同一个工作台完成。"
      stageLabel="托盘演示 · 注册页"
      stageTestId="register-stage"
      footer={
        <p>
          已有账号？{' '}
          <Link href="/login" className="font-medium text-primary underline-offset-4 hover:underline">
            返回登录
          </Link>
        </p>
      }
      features={[
        '注册即开通标准版，无需安装与配置',
        '首管理员可直接维护企业内账号',
        '方案、图纸与料单同源保存',
      ]}
    >
      <form className="space-y-4" onSubmit={handleSubmit}>
        <div className="space-y-2">
          <Label htmlFor="companyName">企业名称</Label>
          <Input
            id="companyName"
            autoComplete="organization"
            value={companyName}
            onChange={(e) => setCompanyName(e.target.value)}
            placeholder="请输入企业名称"
            className="h-11"
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
            className="h-11"
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
            className="h-11"
          />
        </div>
        <div className="space-y-2">
          <Label htmlFor="password">密码</Label>
          <div className="relative">
            <Input
              id="password"
              type={showPassword ? 'text' : 'password'}
              autoComplete="new-password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder="至少 8 位"
              className="h-11 pr-10"
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
        <div className="space-y-2">
          <Label htmlFor="confirmPassword">确认密码</Label>
          <div className="relative">
            <Input
              id="confirmPassword"
              type={showConfirmPassword ? 'text' : 'password'}
              autoComplete="new-password"
              value={confirmPassword}
              onChange={(e) => setConfirmPassword(e.target.value)}
              placeholder="再次输入密码"
              className="h-11 pr-10"
            />
            <Button
              type="button"
              variant="ghost"
              size="icon-sm"
              className="absolute inset-y-0 right-1 my-auto text-muted-foreground"
              aria-label={showConfirmPassword ? '隐藏确认密码' : '显示确认密码'}
              aria-pressed={showConfirmPassword}
              title={showConfirmPassword ? '隐藏确认密码' : '显示确认密码'}
              onClick={() => setShowConfirmPassword((v) => !v)}
            >
              {showConfirmPassword ? <EyeOff className="size-4" /> : <Eye className="size-4" />}
            </Button>
          </div>
        </div>

        {error ? <p className="text-sm text-destructive">{error}</p> : null}

        <Button
          type="submit"
          className="h-11 w-full bg-primary text-primary-foreground hover:bg-primary/90"
          disabled={submitting}
        >
          {submitting ? '注册中…' : '注册并进入'}
        </Button>
      </form>
    </AuthShell>
  );
}
