import type { Metadata } from 'next';
import './globals.css';

export const metadata: Metadata = {
  title: '梅好木业',
  description: '木包装数字化系统',
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}): React.ReactElement {
  return (
    <html lang="zh-CN">
      <body className="bg-bg text-fg">{children}</body>
    </html>
  );
}
