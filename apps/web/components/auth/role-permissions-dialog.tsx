'use client';

// 角色权限说明（product/账号与权限.md R-账号与权限-003）：
// 只读弹窗，矩阵由共享 ROLE_SCOPES 生成，避免与代码权限漂移。

import {
  ROLE_DESCRIPTIONS,
  ROLE_LABELS,
  USER_ROLES,
  hasScope,
  type Scope,
  type UserRole,
} from '@mcc/shared';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';

const MODULES: Array<{
  label: string;
  view: Scope;
  manage: Scope | null;
}> = [
  { label: '订单', view: 'order:view', manage: 'order:manage' },
  { label: '客户', view: 'customer:view', manage: 'customer:manage' },
  { label: '包装设计', view: 'packaging:view', manage: 'packaging:manage' },
  { label: '采购', view: 'purchase:view', manage: 'purchase:manage' },
  { label: '供应商', view: 'supplier:view', manage: 'supplier:manage' },
  { label: '生产单据', view: 'production:view', manage: 'production:manage' },
  { label: '库存', view: 'inventory:view', manage: 'inventory:manage' },
  { label: '财务', view: 'finance:view', manage: 'finance:manage' },
  { label: '材料毛利', view: 'profit:view', manage: null },
  { label: '账号管理', view: 'account:manage', manage: null },
  { label: '审计日志', view: 'audit:view', manage: null },
];

function cellText(role: UserRole, module: (typeof MODULES)[number]): string {
  if (hasScope(role, module.view)) {
    if (module.manage === null) {
      return '全部';
    }
    return hasScope(role, module.manage) ? '查看 + 维护' : '仅查看';
  }
  return '—';
}

export function RolePermissionsDialog({
  open,
  onOpenChange,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}): React.ReactElement {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent
        className="flex max-h-[85vh] w-[min(1100px,96vw)] max-w-none flex-col gap-0 overflow-hidden p-0 sm:max-w-none"
        data-testid="role-permissions-dialog"
      >
        <DialogHeader className="shrink-0 border-b border-border px-6 py-4 pr-12">
          <DialogTitle>角色权限说明</DialogTitle>
          <DialogDescription>
            角色固定为四类，不可自定义；权限以服务端校验为准，界面只负责隐藏入口。
          </DialogDescription>
        </DialogHeader>

        <div className="scroll-area min-h-0 min-w-0 flex-1 space-y-3 overflow-y-auto px-6 py-4">
          <div className="min-w-0 rounded-lg border border-border">
            <Table containerClassName="overflow-x-auto">
              <TableHeader>
                <TableRow>
                  <TableHead>角色</TableHead>
                  {MODULES.map((module) => (
                    <TableHead key={module.label} className="text-center">
                      {module.label}
                    </TableHead>
                  ))}
                </TableRow>
              </TableHeader>
              <TableBody>
                {USER_ROLES.map((role) => (
                  <TableRow key={role}>
                    <TableCell>
                      <div className="font-medium">{ROLE_LABELS[role]}</div>
                      <div className="mt-0.5 text-xs text-muted-foreground">
                        {ROLE_DESCRIPTIONS[role]}
                      </div>
                    </TableCell>
                    {MODULES.map((module) => (
                      <TableCell key={module.label} className="text-center">
                        {cellText(role, module)}
                      </TableCell>
                    ))}
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>

          <ul className="space-y-1 text-xs text-muted-foreground">
            <li>PC 与手机端共用同一套权限；手机端提供销售、客户、采购、供应商、生产与库存、资金页面；账号管理与审计日志只在 PC 端使用。</li>
            <li>管理员可以有多个，但必须保留至少一个启用状态的管理员；不能停用自己或最后一个管理员。</li>
            <li>销售单的查看、打印属于查看权限；新建、编辑与删除需要维护权限；材料毛利只读，仅管理员可见。</li>
          </ul>
        </div>

        <div className="flex shrink-0 items-center gap-2 border-t border-border px-6 py-4">
          <Button type="button" onClick={() => onOpenChange(false)}>
            关闭
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
