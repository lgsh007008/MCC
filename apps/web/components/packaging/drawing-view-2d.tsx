'use client';

import * as React from 'react';
import {
  isNotchedStringer,
  PALLET_ROLE_COLORS,
  projectIsometricPoint,
  projectPalletPiece,
  sortPiecesForIsometric,
  sortPiecesForView,
  type PalletGeometry,
  type PalletPiece,
  type PalletView,
} from '@mcc/shared';

export type PalletDrawingView = 'three' | 'top' | 'front' | 'side' | 'iso';

interface PalletDrawing2DProps {
  geometry: PalletGeometry;
  view: PalletDrawingView;
  selectedIndex: number;
  onSelect?: (componentIndex: number) => void;
  viewBox?: { x: number; y: number; width: number; height: number };
  /** 缩略图模式：隐藏视图名称、收紧取景，不可交互 */
  mini?: boolean;
}

const NORMAL_STROKE = '#694a2f';
const SELECTED_STROKE = '#b83e38';
// 2D 默认取景比例：单视图略松、三视图 / 分屏小图更松，避免默认顶满画布。
const FIT_SCALE_SINGLE = 0.78;
const FIT_SCALE_MINI = 0.73;

function fitRect(
  frame: [number, number, number, number],
  dimX: number,
  dimY: number,
  padding: number,
  fitScale = 1,
): { scale: number; ox: number; oy: number } {
  const [fx, fy, fw, fh] = frame;
  const scale =
    Math.min(
      (fw - padding * 2) / Math.max(1, dimX),
      (fh - padding * 2 - 18) / Math.max(1, dimY),
    ) * fitScale;
  return {
    scale,
    ox: fx + (fw - dimX * scale) / 2,
    oy: fy + (fh - dimY * scale) / 2 + 5,
  };
}

function palette(role: PalletPiece['role'], selected: boolean): React.SVGProps<SVGRectElement> {
  return {
    fill: PALLET_ROLE_COLORS[role] ?? '#9eaa9f',
    stroke: selected ? SELECTED_STROKE : NORMAL_STROKE,
    strokeWidth: selected ? 2.5 : 0.8,
    style: {
      cursor: 'pointer',
      filter: selected ? 'drop-shadow(0 0 2.5px rgba(184, 62, 56, 0.9))' : undefined,
    },
  };
}

function notchedBottomPoints(piece: PalletPiece): Array<[number, number, number]> {
  const { x, y, z, l, h } = piece;
  const notchWidth = l * 0.18;
  const notchHeight = h * 0.58;
  const points: Array<[number, number, number]> = [
    [x, y, z + h],
    [x + l, y, z + h],
    [x + l, y, z],
  ];
  for (const center of [0.75, 0.25]) {
    const right = x + l * center + notchWidth / 2;
    const left = x + l * center - notchWidth / 2;
    points.push([right, y, z], [right, y, z + notchHeight], [left, y, z + notchHeight], [left, y, z]);
  }
  points.push([x, y, z]);
  return points;
}

export function DrawingView2D({
  geometry,
  view,
  selectedIndex,
  onSelect,
  viewBox,
  mini = false,
}: PalletDrawing2DProps): React.ReactElement {
  const renderProjection = (
    projection: PalletView,
    frame: [number, number, number, number],
    mini = false,
  ): React.ReactNode => {
    const { L, W, H, pieces } = geometry;
    const dimX = projection === 'side' ? W : L;
    const dimY = projection === 'top' ? W : H;
    const { scale, ox, oy } = fitRect(
      frame,
      dimX,
      dimY,
      mini ? 10 : 28,
      mini ? FIT_SCALE_MINI : FIT_SCALE_SINGLE,
    );
    const sorted = sortPiecesForView(pieces, projection);
    return (
      <g>
        {sorted.map((piece) => {
          const rect = projectPalletPiece(piece, projection, H);
          const rx = ox + rect.x * scale;
          const ry = oy + rect.y * scale;
          const rw = Math.max(1, rect.w * scale);
          const rh = Math.max(1, rect.h * scale);
          const selected = piece.componentIndex === selectedIndex;
          const isNotched = projection === 'front' && isNotchedStringer(piece);
          const opacity = projection === 'top' && piece.z < H / 2 ? 0.55 : 0.92;
          if (isNotched) {
            const notchWidth = rw * 0.18;
            const notchHeight = rh * 0.58;
            const left = [0.25, 0.75].map((center) => rx + rw * center - notchWidth / 2);
            const right = left.map((value) => value + notchWidth);
            const path = [
              `M ${rx} ${ry}`,
              `H ${rx + rw}`,
              `V ${ry + rh}`,
              `H ${right[1]}`,
              `V ${ry + rh - notchHeight}`,
              `H ${left[1]}`,
              `V ${ry + rh}`,
              `H ${right[0]}`,
              `V ${ry + rh - notchHeight}`,
              `H ${left[0]}`,
              `V ${ry + rh}`,
              `H ${rx}`,
              'Z',
            ].join(' ');
            return (
              <g key={`${piece.componentIndex}-${piece.label}-${rx}-${ry}`}>
                <path
                  d={path}
                  {...palette(piece.role, selected)}
                  opacity={opacity}
                  onClick={() => onSelect?.(piece.componentIndex)}
                >
                  <title>{`${piece.label}｜${piece.l}×${piece.w}×${piece.h} mm`}</title>
                </path>
                {selected ? (
                  <path
                    d={path}
                    fill={SELECTED_STROKE}
                    fillOpacity={0.14}
                    stroke="none"
                    pointerEvents="none"
                  />
                ) : null}
              </g>
            );
          }
          return (
            <g key={`${piece.componentIndex}-${piece.label}-${rx}-${ry}`}>
              <rect
                x={rx}
                y={ry}
                width={rw}
                height={rh}
                {...palette(piece.role, selected)}
                opacity={opacity}
                onClick={() => onSelect?.(piece.componentIndex)}
              >
                <title>{`${piece.label}｜${piece.l}×${piece.w}×${piece.h} mm`}</title>
              </rect>
              {selected ? (
                <rect
                  x={rx}
                  y={ry}
                  width={rw}
                  height={rh}
                  fill={SELECTED_STROKE}
                  fillOpacity={0.14}
                  stroke="none"
                  pointerEvents="none"
                />
              ) : null}
            </g>
          );
        })}
        {!mini ? (
          <g>
            <line
              x1={ox}
              y1={oy + dimY * scale + 26}
              x2={ox + dimX * scale}
              y2={oy + dimY * scale + 26}
              stroke={SELECTED_STROKE}
              strokeWidth={1}
            />
            <text
              x={ox + (dimX * scale) / 2}
              y={oy + dimY * scale + 21}
              textAnchor="middle"
              className="fill-[#b83e38] text-[12px]"
            >
              {dimX} mm
            </text>
            <line
              x1={ox - 13}
              y1={oy}
              x2={ox - 13}
              y2={oy + dimY * scale}
              stroke={SELECTED_STROKE}
              strokeWidth={1}
            />
            <text
              x={ox - 18}
              y={oy + (dimY * scale) / 2}
              textAnchor="middle"
              transform={`rotate(-90 ${ox - 18} ${oy + (dimY * scale) / 2})`}
              className="fill-[#b83e38] text-[12px]"
            >
              {dimY} mm
            </text>
          </g>
        ) : null}
      </g>
    );
  };

  const renderIsometric = (
    frame: [number, number, number, number],
    mini = false,
  ): React.ReactNode => {
    const { L, W, H, pieces } = geometry;
    const pad = mini ? 10 : 28;
    const fitScale = mini ? FIT_SCALE_MINI : FIT_SCALE_SINGLE;
    const bounds = [
      [0, 0, 0],
      [L, 0, 0],
      [0, W, 0],
      [L, W, 0],
      [0, 0, H],
      [L, 0, H],
      [0, W, H],
      [L, W, H],
    ].map(([x, y, z]) => projectIsometricPoint(x!, y!, z!));
    const minU = Math.min(...bounds.map((point) => point.u));
    const maxU = Math.max(...bounds.map((point) => point.u));
    const minV = Math.min(...bounds.map((point) => point.v));
    const maxV = Math.max(...bounds.map((point) => point.v));
    const scale =
      Math.min(
        (frame[2] - pad * 2) / Math.max(1, maxU - minU),
        (frame[3] - pad * 2 - (mini ? 0 : 18)) / Math.max(1, maxV - minV),
      ) * fitScale;
    const ox = frame[0] + frame[2] / 2 - ((minU + maxU) * scale) / 2;
    const oy = frame[1] + frame[3] / 2 - ((minV + maxV) * scale) / 2 + (mini ? 0 : 8);
    const pt = (x: number, y: number, z: number): string => {
      const point = projectIsometricPoint(x, y, z);
      return `${ox + point.u * scale},${oy + point.v * scale}`;
    };
    return (
      <g>
        {sortPiecesForIsometric(pieces).map((piece) => {
          const { x, y, z, l, w, h } = piece;
          const selected = piece.componentIndex === selectedIndex;
          const stroke = selected ? SELECTED_STROKE : NORMAL_STROKE;
          const strokeWidth = selected ? 2.5 : 0.7;
          const roleColor = PALLET_ROLE_COLORS[piece.role] ?? '#9eaa9f';
          const frontPoints = isNotchedStringer(piece)
            ? notchedBottomPoints(piece).map(([px, py, pz]) => pt(px, py, pz)).join(' ')
            : [pt(x, y + w, z), pt(x + l, y + w, z), pt(x + l, y + w, z + h), pt(x, y + w, z + h)].join(' ');
          return (
            <g
              key={`${piece.componentIndex}-${piece.label}-iso`}
              onClick={() => onSelect?.(piece.componentIndex)}
              style={{
                cursor: 'pointer',
                filter: selected
                  ? 'drop-shadow(0 0 2.5px rgba(184, 62, 56, 0.9))'
                  : undefined,
              }}
            >
              <title>{`${piece.label}｜${piece.l}×${piece.w}×${piece.h} mm`}</title>
              <polygon points={frontPoints} fill={roleColor} fillOpacity={0.72} stroke={stroke} strokeWidth={strokeWidth} />
              <polygon
                points={[pt(x + l, y, z), pt(x + l, y + w, z), pt(x + l, y + w, z + h), pt(x + l, y, z + h)].join(' ')}
                fill={roleColor}
                fillOpacity={0.56}
                stroke={stroke}
                strokeWidth={strokeWidth}
              />
              <polygon
                points={[pt(x, y, z + h), pt(x + l, y, z + h), pt(x + l, y + w, z + h), pt(x, y + w, z + h)].join(' ')}
                fill={roleColor}
                fillOpacity={0.95}
                stroke={stroke}
                strokeWidth={strokeWidth}
              />
            </g>
          );
        })}
      </g>
    );
  };

  return (
    <svg
      viewBox={viewBox ? `${viewBox.x} ${viewBox.y} ${viewBox.width} ${viewBox.height}` : '0 0 1000 520'}
      role="img"
      aria-label="包装工程图"
      className="h-full w-full select-none"
      preserveAspectRatio="xMidYMid meet"
    >
      {geometry.pieces.length === 0 ? (
        <text x={500} y={260} textAnchor="middle" className="fill-muted-foreground text-[14px]">
          暂无构件，请先添加面板、纵梁或墩块
        </text>
      ) : view === 'three' ? (
        <>
          {renderProjection('front', [10, 10, 485, 245], true)}
          {renderProjection('side', [505, 10, 485, 245], true)}
          {renderProjection('top', [10, 265, 485, 245], true)}
          {renderIsometric([505, 265, 485, 245], true)}
        </>
      ) : view === 'iso' ? (
        renderIsometric([0, 0, 1000, 520], mini)
      ) : (
        renderProjection(view, [0, 0, 1000, 520], mini)
      )}
    </svg>
  );
}
