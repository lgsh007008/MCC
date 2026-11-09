'use client';

import { useEffect, useState } from 'react';
import { currentUsername } from '@/lib/auth/session';

// 首页（product/平台布局.md R-平台布局-001 菜单表）：静态欢迎页——
// 欢迎语 + 当前登录用户名，纯组件拼装、不单列页面设计；页面归属 platform 领域。
export default function AdminHomePage(): React.ReactElement {
  const [username, setUsername] = useState<string | null>(null);

  useEffect(() => {
    setUsername(currentUsername());
  }, []);

  return (
    <div className="space-y-2">
      <h1 className="text-xl font-semibold">首页</h1>
      <p className="text-sm text-muted-foreground">
        欢迎使用梅好木业数字化系统{username ? `，${username}` : ''}
      </p>
    </div>
  );
}