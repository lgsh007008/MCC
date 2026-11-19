'use client';

import * as React from 'react';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';

interface SaveSchemeDialogProps {
  open: boolean;
  defaultName: string;
  defaultCustomerName: string;
  submitting: boolean;
  error: string | null;
  onOpenChange: (open: boolean) => void;
  onSubmit: (values: { name: string; customerName: string }) => void;
}

// 首次保存（product/包装设计.md R-包装设计-006 · 首次保存）：
// 只收方案名称与客户名称，创建后由调用方替换为正式方案路由。
export function SaveSchemeDialog({
  open,
  defaultName,
  defaultCustomerName,
  submitting,
  error,
  onOpenChange,
  onSubmit,
}: SaveSchemeDialogProps): React.ReactElement {
  const [name, setName] = React.useState(defaultName);
  const [customerName, setCustomerName] = React.useState(defaultCustomerName);

  React.useEffect(() => {
    if (open) {
      setName(defaultName);
      setCustomerName(defaultCustomerName);
    }
  }, [open, defaultName, defaultCustomerName]);

  const canSubmit = name.trim().length > 0 && !submitting;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>保存方案</DialogTitle>
          <DialogDescription>
            首次保存需要填写方案名称；保存后生成正式方案编号，后续修改直接保存。
          </DialogDescription>
        </DialogHeader>
        <form
          className="grid gap-3"
          onSubmit={(event) => {
            event.preventDefault();
            if (!canSubmit) return;
            onSubmit({ name: name.trim(), customerName: customerName.trim() });
          }}
        >
          <label className="grid gap-1 text-xs">
            <Label>方案名称</Label>
            <Input
              value={name}
              onChange={(event) => setName(event.target.value)}
              maxLength={100}
              placeholder="如 出口木箱 + 托盘包装方案"
              autoFocus
            />
          </label>
          <label className="grid gap-1 text-xs">
            <Label>客户名称</Label>
            <Input
              value={customerName}
              onChange={(event) => setCustomerName(event.target.value)}
              maxLength={100}
              placeholder="可选"
            />
          </label>
          {error ? <p className="text-xs text-destructive">{error}</p> : null}
          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)} disabled={submitting}>
              取消
            </Button>
            <Button type="submit" disabled={!canSubmit}>
              {submitting ? '保存中…' : '保存并进入工作台'}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
