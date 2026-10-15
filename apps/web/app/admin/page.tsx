// 后台路由组（鉴权后进入）。前端路由分组不构成安全边界，权限由服务端统一拦截（技术方案 §9.2）。
export default function AdminHomePage(): React.ReactElement {
  return (
    <main className="mx-auto max-w-3xl p-8">
      <h1 className="text-2xl font-semibold">管理后台</h1>
      <p className="mt-2 text-sm">后台占位页：后续按领域挂载各管理模块。</p>
    </main>
  );
}
