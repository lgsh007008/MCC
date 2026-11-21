'use client';

import * as React from 'react';
import Link from 'next/link';

// 移动端底部固定 CTA（product/落地页.md R-落地页-003）：
// 页尾 CTA 进入视口时隐藏，避免同屏出现两个注册按钮。
export function StickyCta(): React.ReactElement {
  const [visible, setVisible] = React.useState(true);

  React.useEffect(() => {
    const target = document.getElementById('final-cta');
    if (!target) {
      return;
    }
    const observer = new IntersectionObserver(
      (entries) => {
        setVisible(!entries.some((entry) => entry.isIntersecting));
      },
      { threshold: 0.2 },
    );
    observer.observe(target);
    return () => observer.disconnect();
  }, []);

  return (
    <div
      className={`fixed inset-x-0 bottom-0 z-40 border-t border-border bg-background/95 px-3 pb-[calc(0.75rem+env(safe-area-inset-bottom))] pt-3 backdrop-blur md:hidden ${
        visible ? '' : 'hidden'
      }`}
    >
      <Link
        href="/register"
        className="inline-flex h-11 w-full items-center justify-center rounded-md bg-primary text-base font-medium text-primary-foreground"
      >
        免费注册企业
      </Link>
    </div>
  );
}
