'use client';

// 收支汇总口径说明弹窗的共用展示原子（经营收支 / 资金收付两个弹窗）：
// 分组标题 + 两列信息条；沿用平台弹窗覆盖层，不单独构成新形态。

export function HelpSection({
  title,
  children,
}: {
  title: string;
  children: React.ReactNode;
}): React.ReactElement {
  return (
    <section className="space-y-2">
      <h3 className="text-sm font-medium">{title}</h3>
      <div className="space-y-1.5">{children}</div>
    </section>
  );
}

export function HelpRow({
  label,
  children,
}: {
  label: string;
  children: React.ReactNode;
}): React.ReactElement {
  return (
    <div className="flex min-w-0 items-start gap-2">
      <span className="w-16 shrink-0 text-right text-muted-foreground">{label}</span>
      <span className="min-w-0 flex-1 break-words">{children}</span>
    </div>
  );
}
