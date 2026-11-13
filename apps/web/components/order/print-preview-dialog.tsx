'use client';

// 打印预览弹窗（product/order.md R-订单-002、product/平台布局.md「打印预览弹窗」）：
// 左侧 A4 预览按容器等比缩放，右侧操作栏；打印走隐藏 iframe，只输出单据模板。

import { useEffect, useRef, useState } from 'react';
import { flushSync } from 'react-dom';
import { createRoot } from 'react-dom/client';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogTitle } from '@/components/ui/dialog';
import { api } from '@/lib/api';
import {
  SALE_ORDER_PRINT_CSS,
  SaleOrderPrint,
  type SaleOrderPrintData,
} from './sale-order-print';

// A4 在 96dpi 下的像素尺寸，仅用于计算预览缩放比例
const A4_WIDTH_PX = 794;
const A4_HEIGHT_PX = 1123;

export function PrintPreviewDialog({
  open,
  onOpenChange,
  order,
  orderId,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  order: SaleOrderPrintData;
  orderId: string;
}): React.ReactElement {
  const previewRef = useRef<HTMLDivElement>(null);
  const [scale, setScale] = useState(1);
  const [printing, setPrinting] = useState(false);

  // 等比缩放：宽度、高度都放得下，最大 100%
  useEffect(() => {
    if (!open) {
      return;
    }
    const el = previewRef.current;
    if (!el) {
      return;
    }
    const update = (): void => {
      const rect = el.getBoundingClientRect();
      const next = Math.min(
        (rect.width - 48) / A4_WIDTH_PX,
        (rect.height - 48) / A4_HEIGHT_PX,
        1,
      );
      setScale(Math.max(next, 0.2));
    };
    update();
    const observer = new ResizeObserver(update);
    observer.observe(el);
    return () => observer.disconnect();
  }, [open]);

  // 打印隔离：隐藏 iframe + 复制主文档样式 + 注入打印规则，渲染同一模板后调 print()
  const handlePrint = (): void => {
    // 打印审计（product/审计日志.md R-审计-001）：只记录触发，不阻塞打印。
    void api
      .POST('/api/v1/sale-orders/{id}/print-events', {
        params: { path: { id: orderId } },
      })
      .catch(() => undefined);
    setPrinting(true);
    const iframe = document.createElement('iframe');
    iframe.setAttribute('aria-hidden', 'true');
    iframe.style.cssText =
      'position:fixed;right:0;bottom:0;width:0;height:0;border:0;visibility:hidden;';
    document.body.appendChild(iframe);
    const doc = iframe.contentDocument;
    const win = iframe.contentWindow;
    if (!doc || !win) {
      iframe.remove();
      setPrinting(false);
      return;
    }
    doc.open();
    doc.write('<!doctype html><html lang="zh-CN"><head><meta charset="utf-8" /></head><body></body></html>');
    doc.close();

    document.querySelectorAll('style, link[rel="stylesheet"]').forEach((node) => {
      doc.head.appendChild(node.cloneNode(true));
    });
    const printStyle = doc.createElement('style');
    printStyle.textContent = SALE_ORDER_PRINT_CSS;
    doc.head.appendChild(printStyle);

    const root = createRoot(doc.body);
    flushSync(() => {
      root.render(<SaleOrderPrint order={order} />);
    });

    let cleaned = false;
    const cleanup = (): void => {
      if (cleaned) {
        return;
      }
      cleaned = true;
      try {
        root.unmount();
      } catch {
        // 根已卸载时忽略
      }
      iframe.remove();
      setPrinting(false);
    };
    win.addEventListener('afterprint', cleanup, { once: true });
    window.setTimeout(() => {
      try {
        win.focus();
        win.print();
      } catch {
        cleanup();
      }
    }, 50);
    // 兜底：部分浏览器不触发 afterprint，避免 iframe 残留
    window.setTimeout(cleanup, 60_000);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent
        className="flex h-[90vh] w-[min(1200px,94vw)] max-w-none flex-col gap-0 overflow-hidden p-0 sm:max-w-none"
        showCloseButton={false}
      >
        <DialogTitle className="sr-only">打印预览</DialogTitle>
        <div className="flex min-h-0 flex-1" data-testid="print-preview-dialog">
          <div
            ref={previewRef}
            className="flex min-w-0 flex-1 items-start justify-center overflow-auto bg-muted/50 p-6"
          >
            <div style={{ zoom: scale }}>
              <div className="w-[210mm] min-h-[297mm] bg-white px-[10mm] py-[12mm] shadow-lg">
                <SaleOrderPrint order={order} />
              </div>
            </div>
          </div>

          <aside className="flex w-60 shrink-0 flex-col border-l border-border bg-popover p-4">
            <h2 className="text-sm font-semibold">打印预览</h2>
            <dl className="mt-4 space-y-2 text-xs">
              <div className="flex justify-between gap-3">
                <dt className="text-muted-foreground">单号</dt>
                <dd className="tabular-nums">{order.code}</dd>
              </div>
              <div className="flex justify-between gap-3">
                <dt className="text-muted-foreground">纸张</dt>
                <dd>A4 纵向</dd>
              </div>
              <div className="flex justify-between gap-3">
                <dt className="text-muted-foreground">联次</dt>
                <dd>单联</dd>
              </div>
            </dl>
            <p className="mt-4 text-xs text-muted-foreground">
              份数与 PDF 在浏览器打印对话框中设置；选择「另存为 PDF」即可保存。
            </p>
            <p className="mt-2 text-xs text-muted-foreground">
              如出现浏览器页眉页脚（时间、网址等），请在打印对话框中取消勾选「页眉和页脚」。
            </p>
            <div className="mt-auto flex flex-col gap-2">
              <Button type="button" onClick={handlePrint} disabled={printing}>
                {printing ? '准备中…' : '打印'}
              </Button>
              <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
                关闭
              </Button>
            </div>
          </aside>
        </div>
      </DialogContent>
    </Dialog>
  );
}
