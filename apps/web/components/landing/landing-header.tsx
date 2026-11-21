'use client';

import Link from 'next/link';

// 落地页顶部（product/落地页.md R-落地页-001 / 004）：白色悬浮导航，
// 颜色只引用平台令牌；品牌绿仅用于品牌块与主按钮。
export function LandingHeader(): React.ReactElement {
  return (
    <header className="sticky top-0 z-50 border-b border-border bg-background/95 backdrop-blur">
      <div className="mx-auto flex h-16 w-full max-w-6xl items-center justify-between px-5 md:px-8">
        <Link href="/" className="flex items-center gap-2.5 text-sm font-semibold text-foreground">
          <span className="grid size-8 place-items-center rounded-md bg-primary text-sm font-bold text-primary-foreground">
            梅
          </span>
          <span className="tracking-wide">梅好木业</span>
        </Link>

        <nav aria-label="主导航" className="hidden items-center gap-7 text-sm md:flex">
          <Link
            href="#workbench"
            className="text-muted-foreground transition-colors hover:text-foreground"
          >
            在线体验
          </Link>
          <Link
            href="#flow"
            className="text-muted-foreground transition-colors hover:text-foreground"
          >
            设计流程
          </Link>
          <Link
            href="#features"
            className="text-muted-foreground transition-colors hover:text-foreground"
          >
            能力
          </Link>
        </nav>

        <div className="flex items-center gap-2">
          <Link
            href="/login"
            className="inline-flex h-11 items-center rounded-md px-3 text-sm text-muted-foreground transition-colors hover:text-foreground"
          >
            登录
          </Link>
          <Link
            href="/register"
            className="inline-flex h-11 items-center rounded-md bg-primary px-4 text-sm font-medium text-primary-foreground transition-colors hover:bg-primary/90"
          >
            免费注册
          </Link>
        </div>
      </div>
    </header>
  );
}
