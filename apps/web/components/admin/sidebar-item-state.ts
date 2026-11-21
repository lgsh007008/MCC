// 侧栏统一状态口径（product/平台布局.md R-平台布局-001 /
// design/平台布局.md §1.3）：选中 = 浅灰底 + 加粗；悬停 = 更浅灰底；
// 浮层打开但未选中 = 轻灰底；不使用图标底块、阴影或竖条。
export function sidebarItemStateClass({
  selected,
  open = false,
}: {
  selected: boolean;
  open?: boolean;
}): string {
  if (selected) {
    return 'bg-sidebar-accent text-sidebar-accent-foreground font-semibold';
  }
  if (open) {
    return 'bg-sidebar-accent/40 text-sidebar-foreground hover:bg-sidebar-accent/60';
  }
  return 'text-sidebar-foreground/75 hover:bg-sidebar-accent/60 hover:text-sidebar-foreground';
}

// 折叠栏与浮层都可能有 overflow，焦点环必须内嵌，否则会被裁切；焦点环保持中性色。
export const sidebarItemFocusClass =
  'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-sidebar-ring focus-visible:ring-inset';
