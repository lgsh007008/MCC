'use client';

import { Label } from '@/components/ui/label';

// 移动表单字段包装（product/平台布局.md 移动页 · 表单）：
// Label 在上、控件在下并占满整行；间距与 htmlFor 关联由本组件统一，页面不各写一套。

export function MobileField({
  label,
  htmlFor,
  children,
}: {
  label: string;
  htmlFor?: string;
  children: React.ReactNode;
}): React.ReactElement {
  return (
    <div className="space-y-1.5">
      <Label htmlFor={htmlFor} className="text-mobile-label text-muted-foreground">
        {label}
      </Label>
      {children}
    </div>
  );
}
