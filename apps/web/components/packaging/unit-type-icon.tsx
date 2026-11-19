'use client';

import * as React from 'react';

// 单元目录的类型缩略图（design/包装设计.md §9.2）：
// 7 个 16×16 结构示意，与平台菜单的 lucide 线稿图标区分，避免同屏混淆。

export type UnitTypeKey =
  | 'PALLET'
  | 'CRATE'
  | 'SKID'
  | 'FRAME'
  | 'DIVIDER'
  | 'DUNNAGE'
  | 'STEEL_STRAP';

const SHAPES: Record<UnitTypeKey, React.ReactNode> = {
  PALLET: (
    <>
      <path d="M2 5h12M2 8.5h12M2 12h12" />
      <path d="M4 12v2M8 12v2M12 12v2" />
    </>
  ),
  CRATE: (
    <>
      <rect x="2.5" y="3" width="11" height="10" rx="0.5" />
      <path d="M6 3v10M10 3v10" />
    </>
  ),
  SKID: (
    <>
      <rect x="2.5" y="2.5" width="11" height="7" rx="0.5" />
      <path d="M2.5 12h11M5 12v2M11 12v2" />
    </>
  ),
  FRAME: <path d="M2 6V2h4M10 2h4v4M14 10v4h-4M6 14H2v-4" />,
  DIVIDER: (
    <>
      <path d="M3 13V3h10M3 13h6" />
      <path d="M10 3v8" />
    </>
  ),
  DUNNAGE: (
    <>
      <rect x="2" y="3" width="12" height="2.4" rx="0.6" />
      <rect x="2" y="6.8" width="12" height="2.4" rx="0.6" />
      <rect x="2" y="10.6" width="12" height="2.4" rx="0.6" />
    </>
  ),
  STEEL_STRAP: (
    <>
      <rect x="3" y="3.5" width="10" height="9" rx="0.5" />
      <path d="M6 1.5v13M10 1.5v13" />
    </>
  ),
};

export function UnitTypeIcon({
  unitType,
  className,
}: {
  unitType: UnitTypeKey;
  className?: string;
}): React.ReactElement {
  return (
    <svg
      viewBox="0 0 16 16"
      fill="none"
      stroke="currentColor"
      strokeWidth={1.2}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden
      className={className}
    >
      {SHAPES[unitType]}
    </svg>
  );
}
