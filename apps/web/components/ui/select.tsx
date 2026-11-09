import * as React from 'react'
import { cn } from 'cn'

// 下拉选择（design/平台布局.md §1.5 页面组装清单）：样式对齐 Input 的语义令牌。
// 当前包装原生 select（管理后台表单量小、原生可访问性最佳）；如需远程搜索 / 多选 /
// 复杂定制，再引入无头 Select 底座（@base-ui/react/select）改封装，调用方 API 不变。
function Select({ className, ...props }: React.ComponentProps<'select'>) {
  return (
    <select
      data-slot="select"
      className={cn(
        'h-8 rounded-md border border-input bg-background px-2 text-sm outline-none',
        'focus-visible:border-ring disabled:cursor-not-allowed disabled:opacity-50',
        className,
      )}
      {...props}
    />
  )
}

export { Select }