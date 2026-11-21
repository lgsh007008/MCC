'use client';

import type { PalletGeometry } from '@mcc/shared';
import { Viewer3D } from '@/components/packaging/viewer-3d';

// 公开演示 3D 舞台：复用工作台 Viewer3D（three.js 内部动态 import），
// 只读、不可选构件、不导出；WebGL 不可用时由 PublicStage 切回 2D 轴测。
export default function Stage3D({
  geometry,
  autoRotate,
  onFallback,
}: {
  geometry: PalletGeometry;
  autoRotate: boolean;
  onFallback: () => void;
}): React.ReactElement {
  return (
    <Viewer3D
      geometry={geometry}
      selectedIndex={-1}
      onSelect={() => undefined}
      autoRotate={autoRotate}
      hint="拖动旋转 · 滚轮缩放"
      frameless
      className="h-full w-full"
      onFallback={onFallback}
    />
  );
}
