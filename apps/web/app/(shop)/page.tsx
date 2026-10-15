// 对外路由组（可索引，SEO）。页面设计见产品文档，此处仅占位。
export default function ShopHomePage(): React.ReactElement {
  return (
    <main className="mx-auto max-w-3xl p-8">
      <h1 className="text-2xl font-semibold">梅好木业 · 在线报价</h1>
      <p className="mt-2 text-sm">对客端占位页：后续在此实现在线报价与下单。</p>
      <a className="mt-6 inline-block text-primary underline" href="/admin">
        进入管理后台
      </a>
    </main>
  );
}
