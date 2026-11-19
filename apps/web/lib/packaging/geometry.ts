import {
  buildCrateGeometry,
  buildDividerGeometry,
  buildDunnageGeometry,
  buildFrameGeometry,
  buildPalletGeometry,
  deriveDividerOuter,
  deriveFrameOuter,
  type PalletGeometry,
  type PalletTemplateType,
} from '@mcc/shared';
import { dividerParamsOf, frameParamsOf, type UnitDraft } from './document';

// 单元几何分发（design/包装设计.md §4.1）：工作台与方案库缩略图共用，
// 保证缩略图、2D / 3D、BOM 消费同一份派生结果。
export function buildGeometryForUnit(unit: UnitDraft): PalletGeometry {
  const components = unit.parts;
  if (unit.unitType === 'DUNNAGE') {
    return buildDunnageGeometry(
      {
        outerLengthMm: unit.lengthMm,
        outerWidthMm: unit.widthMm,
        outerHeightMm:
          unit.dunnageArrangement === 'cross'
            ? 2 * unit.dunnageThicknessMm
            : unit.dunnageThicknessMm,
        arrangement: unit.dunnageArrangement,
      },
      components,
    );
  }
  if (unit.unitType === 'DIVIDER') {
    const params = dividerParamsOf(unit);
    return buildDividerGeometry(
      {
        outerLengthMm: deriveDividerOuter(params).lengthMm,
        outerWidthMm: deriveDividerOuter(params).widthMm,
        layerHeightMm: unit.layerHeightMm,
        layerCount: unit.layerCount,
        thicknessMm: unit.thicknessMm,
      },
      components,
    );
  }
  if (unit.unitType === 'FRAME') {
    const params = frameParamsOf(unit);
    return buildFrameGeometry(
      {
        outerLengthMm: unit.lengthMm,
        outerWidthMm: unit.widthMm,
        innerHeightMm: unit.innerHeightMm,
        frameThicknessMm: unit.frameThicknessMm,
        bottomThicknessMm: unit.bottomThicknessMm,
        baseHeightMm: unit.baseHeightMm,
        outerHeightMm: deriveFrameOuter(params).heightMm,
      },
      components,
    );
  }
  if (unit.unitType !== 'PALLET') {
    return buildCrateGeometry(
      {
        outerLengthMm: unit.lengthMm,
        outerWidthMm: unit.widthMm,
        innerHeightMm: unit.innerHeightMm,
        thicknessMm: unit.thicknessMm,
        bottomThicknessMm: unit.bottomThicknessMm,
        baseHeightMm: unit.baseHeightMm,
        frameThicknessMm: unit.frameThicknessMm,
      },
      components,
    );
  }
  return buildPalletGeometry(
    {
      lengthMm: unit.lengthMm,
      widthMm: unit.widthMm,
      templateType: unit.templateCode as PalletTemplateType,
    },
    components,
  );
}
