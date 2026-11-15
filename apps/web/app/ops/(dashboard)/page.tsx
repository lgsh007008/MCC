import { redirect } from 'next/navigation';

// /ops 首页：进入租户管理（平台运营的主入口）
export default function OpsIndexPage(): never {
  redirect('/ops/tenants');
}
