// 2D 画布视口（design/包装设计.md §9.2）：屏幕坐标与图纸 viewBox 的缩放 / 平移纯函数。

export interface ViewBox {
  x: number;
  y: number;
  width: number;
  height: number;
}

export const BASE_VIEWBOX: ViewBox = { x: 0, y: 0, width: 1000, height: 520 };

const MIN_WIDTH = 80;
const MAX_WIDTH = 4000;

const clamp = (value: number, min: number, max: number): number =>
  Math.min(max, Math.max(min, value));

export const fitViewBox = (): ViewBox => ({ ...BASE_VIEWBOX });

export function zoomViewBox(
  viewBox: ViewBox,
  factor: number,
  center: { x: number; y: number } = {
    x: viewBox.x + viewBox.width / 2,
    y: viewBox.y + viewBox.height / 2,
  },
): ViewBox {
  const width = clamp(viewBox.width / factor, MIN_WIDTH, MAX_WIDTH);
  const scale = width / viewBox.width;
  return {
    x: center.x - (center.x - viewBox.x) * scale,
    y: center.y - (center.y - viewBox.y) * scale,
    width,
    height: viewBox.height * scale,
  };
}

export function panViewBox(viewBox: ViewBox, dx: number, dy: number): ViewBox {
  return { ...viewBox, x: viewBox.x + dx, y: viewBox.y + dy };
}

export const isFitted = (viewBox: ViewBox): boolean =>
  Math.abs(viewBox.width - BASE_VIEWBOX.width) < 0.5 &&
  Math.abs(viewBox.height - BASE_VIEWBOX.height) < 0.5 &&
  Math.abs(viewBox.x) < 0.5 &&
  Math.abs(viewBox.y) < 0.5;
