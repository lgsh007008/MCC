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

// 全站二次确认（product/平台布局.md「二次确认规范」；design/平台布局.md §1.7）：
// 页面不维护弹层状态，直接 await confirm({...})；禁止使用浏览器原生 confirm / alert / prompt。
// onConfirm 在弹层内执行，执行期间按钮禁用并显示处理中；取消返回 false，成功返回 true，
// onConfirm 抛错时关闭弹层并把错误抛给调用方（由页面以页内提示展示）。

export interface ConfirmOptions {
  title: string;
  description: React.ReactNode;
  confirmText: string;
  tone?: 'default' | 'danger';
  onConfirm?: () => Promise<void> | void;
}

type ConfirmFn = (options: ConfirmOptions) => Promise<boolean>;

interface PendingConfirm {
  options: ConfirmOptions;
  resolve: (confirmed: boolean) => void;
  reject: (reason?: unknown) => void;
}

const ConfirmContext = React.createContext<ConfirmFn | null>(null);

export function ConfirmProvider({ children }: { children: React.ReactNode }): React.ReactElement {
  const [pending, setPending] = React.useState<PendingConfirm | null>(null);
  const [busy, setBusy] = React.useState(false);

  const confirm = React.useCallback<ConfirmFn>(
    (options) =>
      new Promise<boolean>((resolve, reject) => {
        setBusy(false);
        setPending({ options, resolve, reject });
      }),
    [],
  );

  const cancel = React.useCallback((): void => {
    setPending((current) => {
      current?.resolve(false);
      return null;
    });
    setBusy(false);
  }, []);

  const handleConfirm = async (): Promise<void> => {
    const current = pending;
    if (!current) {
      return;
    }
    setBusy(true);
    try {
      await current.options.onConfirm?.();
      current.resolve(true);
      setPending(null);
    } catch (error) {
      current.reject(error);
      setPending(null);
    } finally {
      setBusy(false);
    }
  };

  return (
    <ConfirmContext.Provider value={confirm}>
      {children}
      {pending ? (
        <Dialog
          open
          onOpenChange={(open) => {
            if (!open && !busy) {
              cancel();
            }
          }}
        >
          <DialogContent
            showCloseButton={false}
            role="alertdialog"
            aria-labelledby="confirm-dialog-title"
            aria-describedby="confirm-dialog-description"
          >
            <DialogHeader>
              <DialogTitle id="confirm-dialog-title">{pending.options.title}</DialogTitle>
              <DialogDescription id="confirm-dialog-description">
                {pending.options.description}
              </DialogDescription>
            </DialogHeader>
            <DialogFooter>
              <Button type="button" variant="outline" autoFocus disabled={busy} onClick={cancel}>
                取消
              </Button>
              <Button
                type="button"
                variant={pending.options.tone === 'danger' ? 'destructive' : 'default'}
                disabled={busy}
                onClick={() => void handleConfirm()}
              >
                {busy ? '处理中…' : pending.options.confirmText}
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      ) : null}
    </ConfirmContext.Provider>
  );
}

export function useConfirm(): ConfirmFn {
  const context = React.useContext(ConfirmContext);
  if (!context) {
    throw new Error('useConfirm 必须在 ConfirmProvider 内使用');
  }
  return context;
}
