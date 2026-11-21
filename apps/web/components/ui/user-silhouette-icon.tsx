import type { ReactElement, SVGProps } from 'react';

// 顶栏默认用户头像的实心人像：不依赖用户名 / 角色，两个后台共用同一形状。
// 填充色走 currentColor，由外层 AvatarFallback 控制。
export function UserSilhouetteIcon(props: SVGProps<SVGSVGElement>): ReactElement {
  return (
    <svg viewBox="0 0 24 24" fill="currentColor" aria-hidden="true" focusable="false" {...props}>
      <circle cx="12" cy="8.2" r="3.4" />
      <path d="M12 13.2c-3.6 0-6.5 2.2-6.5 5.1 0 .6.5 1.1 1.1 1.1h10.8c.6 0 1.1-.5 1.1-1.1 0-2.9-2.9-5.1-6.5-5.1Z" />
    </svg>
  );
}
