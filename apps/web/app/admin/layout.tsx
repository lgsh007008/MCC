import { AdminShell } from '@/components/admin/admin-shell';

// 后台路由组（鉴权后进入）。前端路由分组不构成安全边界，权限由服务端统一拦截；
// 布局壳与登录态守卫见 design/平台布局.md（三区壳由共享 layout 承载，页面只实现主内容区）。
export default function AdminLayout({
  children,
}: {
  children: React.ReactNode;
}): React.ReactElement {
  return <AdminShell>{children}</AdminShell>;
}