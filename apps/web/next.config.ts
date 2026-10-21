import type { NextConfig } from 'next';

// 同源部署形态（技术方案 §1.3：人类流量走统一业务 API）：
// 浏览器请求走 /api/v1/* 由本代理转发到 server，与后端同源，
// 刷新令牌的 httpOnly Cookie（design/账号与权限.md §4）随之同域生效，无需跨域配置。
// 部署形态（staging / prod 反向代理）见技术方案 §9。
const API_INTERNAL_URL = process.env.API_INTERNAL_URL ?? 'http://localhost:3001';

const nextConfig: NextConfig = {
  reactStrictMode: true,
  // workspace 内的 TS 源码包（exports 指向 .ts）需列入转译清单
  transpilePackages: ['@mcc/shared'],
  async rewrites() {
    return [{ source: '/api/v1/:path*', destination: `${API_INTERNAL_URL}/api/v1/:path*` }];
  },
};

export default nextConfig;