'use client';

import Link from 'next/link';
import { SearchIcon, XIcon } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { MobileActionBar, MobileHeader } from '@/components/mobile/mobile-shell';
import { cn } from '@/lib/utils';

// 移动列表共用件（design/平台布局.md §1.5 / §1.8）：销售单、客户档案等所有移动列表
// 强制复用同一套页面骨架、搜索框、卡片、加载更多与空态，避免各页复制导致样式漂移。

// 列表页骨架：顶部栏 + 可选搜索区 + 列表区 + 可选底部主操作条。
// 主操作（新建）固定在底部；顶部栏右侧只放非主操作（如入口页退出）。
export function MobileListPage({
  title,
  backHref,
  search,
  action,
  children,
}: {
  title: string;
  backHref?: string;
  search?: React.ReactNode;
  action?: React.ReactNode;
  children: React.ReactNode;
}): React.ReactElement {
  return (
    <div className={action ? 'pb-24' : undefined}>
      <MobileHeader title={title} backHref={backHref} />
      <div className="space-y-3 p-4">
        {search}
        {children}
      </div>
      {action ? <MobileActionBar>{action}</MobileActionBar> : null}
    </div>
  );
}

export function MobileListSearch({
  value,
  onChange,
  onSearch,
  placeholder,
}: {
  value: string;
  onChange: (value: string) => void;
  /** 传字符串表示按指定值立即搜索（如清除时传空串），不传则用当前输入值 */
  onSearch: (value?: string) => void;
  placeholder: string;
}): React.ReactElement {
  return (
    <form
      onSubmit={(event) => {
        event.preventDefault();
        onSearch();
      }}
    >
      <div className="relative">
        <SearchIcon className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-muted-foreground" />
        <Input
          value={value}
          onChange={(event) => onChange(event.target.value)}
          placeholder={placeholder}
          aria-label={placeholder}
          enterKeyHint="search"
          className="h-12 pr-11 pl-9 text-mobile-body"
        />
        {value ? (
          <button
            type="button"
            aria-label="清除搜索"
            className="absolute top-1/2 right-1 inline-flex size-10 -translate-y-1/2 items-center justify-center rounded-md text-muted-foreground hover:bg-muted"
            onClick={() => {
              onChange('');
              onSearch('');
            }}
          >
            <XIcon className="size-4" />
          </button>
        ) : null}
      </div>
    </form>
  );
}

// 列表卡片（product/平台布局.md 移动页 · 字号角色）：结构固定，页面只传内容——
// 顶行 = 次要文本（日期）+ 状态标签，第二行 = 主行（title 角色）+ 金额（numeric），
// 其后为次行 / 备注 / 页脚；页面不写字号类，避免各页各写一套值。
export function MobileListCard({
  href,
  topLeft,
  topRight,
  title,
  subtitle,
  note,
  amount,
  amountClassName,
  footer,
}: {
  href: string;
  topLeft?: React.ReactNode;
  topRight?: React.ReactNode;
  title: React.ReactNode;
  subtitle?: React.ReactNode;
  note?: React.ReactNode;
  amount?: React.ReactNode;
  amountClassName?: string;
  footer?: React.ReactNode;
}): React.ReactElement {
  return (
    <Link
      href={href}
      className="block rounded-xl border border-border bg-card p-4 active:bg-muted/60"
    >
      {topLeft || topRight ? (
        <div className="flex items-center justify-between gap-3">
          {topLeft ? (
            <span className="text-mobile-body tabular-nums text-muted-foreground">{topLeft}</span>
          ) : (
            <span />
          )}
          {topRight ? (
            <span className="shrink-0 rounded border border-border px-2 py-0.5 text-mobile-caption text-muted-foreground">
              {topRight}
            </span>
          ) : null}
        </div>
      ) : null}

      <div className="mt-1 flex items-start justify-between gap-3">
        <span className="min-w-0 flex-1 text-mobile-title">{title}</span>
        {amount ? (
          <span
            className={cn(
              'shrink-0 text-mobile-numeric font-semibold tabular-nums',
              amountClassName,
            )}
          >
            {amount}
          </span>
        ) : null}
      </div>

      {subtitle ? (
        <p className="mt-1 truncate text-mobile-body text-muted-foreground">{subtitle}</p>
      ) : null}
      {note ? <p className="mt-1 text-mobile-body text-muted-foreground">{note}</p> : null}
      {footer ? (
        <p className="mt-2 whitespace-pre-wrap break-words text-mobile-body text-muted-foreground">
          {footer}
        </p>
      ) : null}
    </Link>
  );
}

export function MobileListLoadMore({
  loading,
  onClick,
}: {
  loading: boolean;
  onClick: () => void;
}): React.ReactElement {
  return (
    <Button
      type="button"
      variant="outline"
      className="h-12 w-full text-mobile-body"
      disabled={loading}
      onClick={onClick}
    >
      {loading ? '加载中…' : '加载更多'}
    </Button>
  );
}

export function MobileListState({
  children,
  tone = 'muted',
}: {
  children: React.ReactNode;
  tone?: 'muted' | 'error';
}): React.ReactElement {
  return (
    <p
      className={
        tone === 'error'
          ? 'py-6 text-center text-mobile-body text-destructive'
          : 'py-6 text-center text-mobile-body text-muted-foreground'
      }
    >
      {children}
    </p>
  );
}
