import Link from 'next/link';
import { ArrowRight } from 'lucide-react';

// 结尾 CTA（product/落地页.md R-落地页-001 / 004）：浅灰底 + 品牌绿主按钮，不使用大面积主色。
export function FinalCta(): React.ReactElement {
  return (
    <section id="final-cta" className="relative overflow-hidden border-b border-border bg-muted/40">
      <div
        className="pointer-events-none absolute -right-24 -top-24 size-72 rounded-full border border-border"
        aria-hidden="true"
      />
      <div
        className="pointer-events-none absolute -bottom-32 -left-16 size-80 rounded-full border border-border"
        aria-hidden="true"
      />

      <div className="relative mx-auto flex w-full max-w-6xl flex-col items-start gap-7 px-5 py-16 md:flex-row md:items-center md:justify-between md:px-8 md:py-20">
        <div>
          <p className="text-xs font-medium tracking-[0.18em] text-primary uppercase">
            Start here
          </p>
          <h2 className="mt-2 text-2xl font-semibold tracking-tight text-foreground md:text-4xl">
            从一个托盘尺寸开始。
          </h2>
          <p className="mt-2 text-sm leading-7 text-muted-foreground">
            注册企业即可使用标准版，无需安装与配置。
          </p>
        </div>
        <Link
          href="/register"
          className="inline-flex h-12 items-center justify-center gap-2 rounded-md bg-primary px-7 text-base font-medium text-primary-foreground transition-colors hover:bg-primary/90"
        >
          免费注册
          <ArrowRight className="size-4" aria-hidden="true" />
        </Link>
      </div>
    </section>
  );
}
