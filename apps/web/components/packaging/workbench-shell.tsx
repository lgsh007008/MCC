'use client';

import * as React from 'react';

interface WorkbenchShellProps {
  topBar: React.ReactNode;
  left: React.ReactNode;
  center: React.ReactNode;
  right: React.ReactNode;
  rightOpen: boolean;
  rightWidth: number;
}

// 工作台壳（product/包装设计.md R-包装设计-006 · 工作台 / design/包装设计.md §9.2）：
// 左栏通高；顶栏只覆盖主内容区（画布 + 右栏）；中央为「视图栏 + 画布 + 底部面板」；
// 右栏在顶栏下方通高，宽度随开合过渡。平台壳不再做颜色特例：
// 左栏用 bg-sidebar，顶栏 / 画布 / 右栏 / 底栏用 content 白。
export function WorkbenchShell({
  topBar,
  left,
  center,
  right,
  rightOpen,
  rightWidth,
}: WorkbenchShellProps): React.ReactElement {
  return (
    <div
      className="flex h-full min-h-0 w-full min-w-0 overflow-hidden bg-background"
      data-testid="packaging-workbench"
      data-workbench
    >
      {left}
      <div className="flex min-h-0 min-w-0 flex-1 flex-col">
        <div className="shrink-0">{topBar}</div>
        <div className="flex min-h-0 min-w-0 flex-1">
          <div className="flex min-h-0 min-w-0 flex-1 flex-col bg-background">{center}</div>
          <div
            aria-hidden={!rightOpen}
            inert={!rightOpen}
            className="min-h-0 shrink-0 overflow-hidden transition-[width] duration-200 ease-linear"
            style={{ width: rightOpen ? rightWidth : 0 }}
          >
            {right}
          </div>
        </div>
      </div>
    </div>
  );
}
