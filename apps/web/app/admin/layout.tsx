import { cookies } from 'next/headers';
import { AdminShell } from '@/components/admin/admin-shell';

// 后台路由组（鉴权后进入）。前端路由分组不构成安全边界，权限由服务端统一拦截；
// 布局壳与登录态守卫见 design/平台布局.md（三区壳由共享 layout 承载，页面只实现主内容区）。
// 侧栏折叠状态由组件库写入 sidebar_state cookie，这里读取并作为初始状态（刷新保持）。
export default async function AdminLayout({
  children,
}: {
  children: React.ReactNode;
}): Promise<React.ReactElement> {
  const cookieStore = await cookies();
  const sidebarOpen = cookieStore.get('sidebar_state')?.value !== 'false';
  return <AdminShell defaultSidebarOpen={sidebarOpen}>{children}</AdminShell>;
}