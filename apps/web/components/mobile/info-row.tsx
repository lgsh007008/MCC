'use client';

// 移动信息行（product/平台布局.md 移动页 · 字号角色）：
// 标签用 label 角色、值用 body 角色；值可传节点（预收、警示色等）。

export function MobileInfoRow({
  label,
  value,
}: {
  label: string;
  value: React.ReactNode;
}): React.ReactElement {
  return (
    <div className="flex items-start justify-between gap-4">
      <span className="shrink-0 text-mobile-label text-muted-foreground">{label}</span>
      <span className="min-w-0 break-words text-right text-mobile-body">{value}</span>
    </div>
  );
}
