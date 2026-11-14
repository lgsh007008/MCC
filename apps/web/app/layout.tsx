import type { Metadata } from 'next';
import './globals.css';
import { Geist } from "next/font/google";
import { cn } from "@/lib/utils";
import { AppQueryProvider } from '@/components/providers/query-provider';

const geist = Geist({subsets:['latin'],variable:'--font-sans'});

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
    <html lang="zh-CN" className={cn("font-sans", geist.variable)}>
      <body className="bg-bg text-fg">
        <AppQueryProvider>{children}</AppQueryProvider>
      </body>
    </html>
  );
}
