import type { Metadata, Viewport } from 'next';
import { MobileShell } from '@/components/mobile/mobile-shell';

// 移动 Web 路由组（design/平台布局.md §1.8；ADR-011）：
// 现场操作页（手机浏览器直接访问），独立壳、适老化基线；与 PC 后台共用 API 与令牌。
export const metadata: Metadata = {
  title: '梅好木业 · 手机开单',
};

export const viewport: Viewport = {
  width: 'device-width',
  initialScale: 1,
  // 不限制缩放：适老化场景允许用户双指放大（ADR-011）
};

export default function MobileLayout({
  children,
}: {
  children: React.ReactNode;
}): React.ReactElement {
  return <MobileShell>{children}</MobileShell>;
}
