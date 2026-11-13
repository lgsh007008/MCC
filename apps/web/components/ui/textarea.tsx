import * as React from 'react'
import { cn } from "@/lib/utils"

// 多行文本域（design/平台布局.md §1.5 页面组装清单）：样式对齐 Input 的语义令牌。
function Textarea({ className, ...props }: React.ComponentProps<'textarea'>) {
  return (
    <textarea
      data-slot="textarea"
      className={cn(
        'flex min-h-16 w-full rounded-md border border-input bg-background px-3 py-2 text-sm outline-none',
        'placeholder:text-muted-foreground focus-visible:border-ring',
        'disabled:cursor-not-allowed disabled:opacity-50',
        className,
      )}
      {...props}
    />
  )
}

export { Textarea }