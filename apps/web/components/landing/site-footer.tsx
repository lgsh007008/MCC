import Link from 'next/link';

// 落地页页脚（product/落地页.md R-落地页-001 / 004）：浅色收尾；
// 备案号、联系方式在实际域名上线后按运营信息补充。
export function SiteFooter(): React.ReactElement {
  return (
    <footer className="bg-background">
      <div className="mx-auto flex w-full max-w-6xl flex-col gap-4 px-5 py-10 text-xs text-muted-foreground md:flex-row md:items-center md:justify-between md:px-8">
        <div className="flex items-center gap-2.5">
          <span className="grid size-7 place-items-center rounded-md bg-primary text-xs font-bold text-primary-foreground">
            梅
          </span>
          <p>© 2026 梅好木业 · 木质包装参数化设计</p>
        </div>
        <nav aria-label="页脚导航" className="flex items-center gap-5">
          <Link href="/login" className="transition-colors hover:text-foreground">
            登录
          </Link>
          <Link href="/register" className="transition-colors hover:text-foreground">
            免费注册
          </Link>
        </nav>
      </div>
    </footer>
  );
}
