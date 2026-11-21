import { redirect } from 'next/navigation';

// 根路径不承载业务页面（product/账号与权限.md R-账号与权限-001）：
// 统一进入登录页，登录成功后按端进入 /admin 或 /m。
export default function RootPage(): null {
  redirect('/login');
  return null;
}
