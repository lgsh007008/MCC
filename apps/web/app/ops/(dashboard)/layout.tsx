import { OpsShell } from '@/components/ops/ops-shell';

// 平台运营路由组（design/平台布局.md §1.9）：只接受平台令牌；壳负责身份守卫与菜单裁剪。
// /ops/login 不在本组内，避免登录页被身份守卫包裹。
export default function OpsLayout({
  children,
}: {
  children: React.ReactNode;
}): React.ReactElement {
  return <OpsShell>{children}</OpsShell>;
}
