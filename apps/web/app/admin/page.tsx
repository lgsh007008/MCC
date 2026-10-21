// 工作台（product/平台布局.md R-平台布局-001 菜单表）：只读聚合页，归 finance（跨领域聚合页）。
// 月度毛利、现金流、近期动态的本体随财务领域需求实现，此处为占位。
export default function AdminHomePage(): React.ReactElement {
  return (
    <div className="space-y-4">
      <h1 className="text-xl font-semibold">工作台</h1>
      <div className="grid gap-4 md:grid-cols-3">
        <section className="rounded-xl border border-border bg-card p-4">
          <p className="text-sm text-muted-foreground">月度毛利</p>
          <p className="mt-2 text-2xl font-semibold">—</p>
        </section>
        <section className="rounded-xl border border-border bg-card p-4">
          <p className="text-sm text-muted-foreground">现金流</p>
          <p className="mt-2 text-2xl font-semibold">—</p>
        </section>
        <section className="rounded-xl border border-border bg-card p-4">
          <p className="text-sm text-muted-foreground">近期动态</p>
          <p className="mt-2 text-2xl font-semibold">—</p>
        </section>
      </div>
      <p className="text-sm text-muted-foreground">
        数据聚合遵守 0-文档驱动开发机制.md 的跨模块页面规则；本体随财务领域需求实现。
      </p>
    </div>
  );
}