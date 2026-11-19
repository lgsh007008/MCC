import { describe, expect, it } from 'vitest';
import { BASE_VIEWBOX, fitViewBox, isFitted, panViewBox, zoomViewBox } from './viewport';

describe('packaging viewport', () => {
  it('默认适配为基准 viewBox', () => {
    expect(fitViewBox()).toEqual(BASE_VIEWBOX);
    expect(isFitted(fitViewBox())).toBe(true);
  });

  it('以中心放大后尺寸变小、中心不变', () => {
    const zoomed = zoomViewBox(fitViewBox(), 2);
    expect(zoomed.width).toBe(500);
    expect(zoomed.height).toBe(260);
    expect(zoomed.x + zoomed.width / 2).toBeCloseTo(500);
    expect(zoomed.y + zoomed.height / 2).toBeCloseTo(260);
  });

  it('平移只改变原点', () => {
    const panned = panViewBox(fitViewBox(), 30, -20);
    expect(panned.x).toBe(30);
    expect(panned.y).toBe(-20);
    expect(panned.width).toBe(BASE_VIEWBOX.width);
  });

  it('缩放受最小 / 最大宽度限制', () => {
    let zoomed = fitViewBox();
    for (let index = 0; index < 20; index += 1) {
      zoomed = zoomViewBox(zoomed, 2);
    }
    expect(zoomed.width).toBeGreaterThanOrEqual(80);
    let reduced = fitViewBox();
    for (let index = 0; index < 20; index += 1) {
      reduced = zoomViewBox(reduced, 0.5);
    }
    expect(reduced.width).toBeLessThanOrEqual(4000);
  });
});
