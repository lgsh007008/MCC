import { SetMetadata } from '@nestjs/common';
import type { FeatureCode } from '@mcc/shared';

// 功能闸门（design/账号与权限.md §6）：FeatureGuard 读取元数据，
// 经 tenant 的 getEffectiveFeatures 判定；不可用返回 403 FEATURE_DISABLED。
// 业务接口按领域声明（order / customer / purchase / supplier / production / finance / audit），
// 基础功能（account / platform / tenant）不挂闸门。
export const FEATURE_KEY = 'mcc:required-feature';

export const RequireFeature = (feature: FeatureCode): MethodDecorator & ClassDecorator =>
  SetMetadata(FEATURE_KEY, feature);
