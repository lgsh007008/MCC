'use client';

// 销售单 A4 打印模板（product/order.md R-订单-002）：纯展示，预览与打印共用同一组件。
// 单联、价格全显示、不打印明细编码；抬头与签字栏固定。

export interface SaleOrderPrintItem {
  lengthMm: number;
  widthMm: number;
  heightMm: number;
  pieces: number;
  pricingMode: 'volume' | 'piece';
  volumeM3: string;
  price: string;
  lineAmount: string;
  otherAmount: string;
  note: string;
}

export interface SaleOrderPrintData {
  code: string;
  saleDate: string;
  customerCode?: string | null;
  customerName: string;
  customerDeleted?: boolean;
  totalVolume: string;
  subtotalAmount: string;
  otherAmount: string;
  totalAmount: string;
  note: string;
  items: SaleOrderPrintItem[];
}

// 仅注入打印 iframe：纸张、边距与分页规则（不写入主文档，避免影响其他页面打印）
export const SALE_ORDER_PRINT_CSS = `
@page { size: A4 portrait; margin: 12mm 10mm; }
html, body { margin: 0; padding: 0; background: #fff; }
body {
  color: #000;
  font-family: "Microsoft YaHei", "PingFang SC", "Noto Sans CJK SC", sans-serif;
  -webkit-print-color-adjust: exact;
  print-color-adjust: exact;
}
.sale-order-print table { width: 100%; border-collapse: collapse; }
.sale-order-print thead { display: table-header-group; }
.sale-order-print tr { break-inside: avoid; page-break-inside: avoid; }
`;

const unitOf = (mode: SaleOrderPrintItem['pricingMode']): string =>
  mode === 'piece' ? '元/根' : '元/m³';

export function SaleOrderPrint({ order }: { order: SaleOrderPrintData }): React.ReactElement {
  return (
    <div className="sale-order-print text-black" data-testid="sale-order-print">
      <header className="text-center">
        <h1 className="text-[16pt] font-bold leading-tight tracking-[0.35em]">梅好木业</h1>
        <p className="mt-1 text-[12pt] font-semibold tracking-[0.5em]">成品销售单</p>
      </header>

      <div className="mt-5 flex flex-wrap gap-x-8 gap-y-1 text-[9.5pt]">
        <span>单号：{order.code}</span>
        <span>销售日期：{order.saleDate}</span>
        <span>
          客户：
          {order.customerCode ? `${order.customerCode} ` : ''}
          {order.customerName}
          {order.customerDeleted ? '（已删除）' : ''}
        </span>
      </div>

      <table className="mt-3 w-full border-collapse text-[9pt]">
        <thead>
          <tr>
            <th className="w-[17mm] border border-black px-1 py-1 text-right font-semibold">长度(mm)</th>
            <th className="w-[17mm] border border-black px-1 py-1 text-right font-semibold">宽度(mm)</th>
            <th className="w-[17mm] border border-black px-1 py-1 text-right font-semibold">高度(mm)</th>
            <th className="w-[13mm] border border-black px-1 py-1 text-right font-semibold">根数</th>
            <th className="w-[16mm] border border-black px-1 py-1 text-center font-semibold">计价方式</th>
            <th className="w-[20mm] border border-black px-1 py-1 text-right font-semibold">方量(m³)</th>
            <th className="w-[21mm] border border-black px-1 py-1 text-right font-semibold">单价</th>
            <th className="w-[23mm] border border-black px-1 py-1 text-right font-semibold">小计金额</th>
            <th className="w-[21mm] border border-black px-1 py-1 text-right font-semibold">其他金额</th>
            <th className="border border-black px-1 py-1 text-left font-semibold">备注</th>
          </tr>
        </thead>
        <tbody>
          {order.items.map((item, index) => (
            <tr key={index}>
              <td className="border border-black px-1 py-1 text-right tabular-nums">{item.lengthMm}</td>
              <td className="border border-black px-1 py-1 text-right tabular-nums">{item.widthMm}</td>
              <td className="border border-black px-1 py-1 text-right tabular-nums">{item.heightMm}</td>
              <td className="border border-black px-1 py-1 text-right tabular-nums">{item.pieces}</td>
              <td className="border border-black px-1 py-1 text-center">
                {item.pricingMode === 'piece' ? '按根数' : '按方量'}
              </td>
              <td className="border border-black px-1 py-1 text-right tabular-nums">{item.volumeM3}</td>
              <td className="border border-black px-1 py-1 text-right tabular-nums">
                {item.price}
                <span className="ml-1 text-[7pt]">{unitOf(item.pricingMode)}</span>
              </td>
              <td className="border border-black px-1 py-1 text-right tabular-nums">{item.lineAmount}</td>
              <td className="border border-black px-1 py-1 text-right tabular-nums">{item.otherAmount}</td>
              <td className="whitespace-pre-wrap border border-black px-1 py-1">{item.note}</td>
            </tr>
          ))}
        </tbody>
      </table>

      <div className="mt-3 flex flex-col items-end gap-1 text-[9.5pt] tabular-nums">
        <span>合计方量：{order.totalVolume} m³</span>
        <span>小计金额：{order.subtotalAmount} 元</span>
        <span>其他金额：{order.otherAmount} 元</span>
        <span className="text-[10.5pt] font-semibold">合计金额：{order.totalAmount} 元</span>
      </div>

      {order.note ? (
        <p className="mt-3 whitespace-pre-wrap text-[9pt]">备注：{order.note}</p>
      ) : null}

      <div
        className="mt-10 flex justify-end text-[9.5pt]"
        data-testid="sale-order-signature"
      >
        <div className="flex w-[70mm] items-end gap-2">
          <span className="shrink-0">客户：</span>
          <span className="h-5 flex-1 border-b border-black" />
        </div>
      </div>
    </div>
  );
}
