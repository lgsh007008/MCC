import { redirect } from 'next/navigation';

// 当前阶段（v20261121）包装设计为 PC 默认落地页；/admin 只做 307 临时重定向，
// 保留旧书签，恢复通用首页时改回静态欢迎页（见 design/平台布局.md §1.6）。
export default function AdminHomePage(): null {
  redirect('/admin/packaging-design');
  return null;
}