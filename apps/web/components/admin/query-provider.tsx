'use client';

import { useState } from 'react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';

// 服务端状态缓存（技术方案 §7.4：服务端状态统一走查询库）：
// 标签切换会重新挂载页面组件；有缓存时先渲染旧数据再后台刷新，避免每次切换闪「加载中」。
// staleTime 0 表示数据始终视为过期（切回/重进都会后台刷新），gcTime 内保留缓存以便即时渲染。
export function AppQueryProvider({ children }: { children: React.ReactNode }): React.ReactElement {
  const [client] = useState(
    () =>
      new QueryClient({
        defaultOptions: {
          queries: {
            staleTime: 0,
            gcTime: 5 * 60_000,
            retry: 1,
            refetchOnWindowFocus: false,
          },
        },
      }),
  );
  return <QueryClientProvider client={client}>{children}</QueryClientProvider>;
}
