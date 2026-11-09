import { INestApplication } from '@nestjs/common';
import { DocumentBuilder, OpenAPIObject, SwaggerModule } from '@nestjs/swagger';

// OpenAPI 契约构建的唯一出口（ADR-006）：main.ts（Swagger UI）与 scripts/gen-openapi.ts
// 共用，杜绝两处文档构建漂移。鉴权声明与守卫保持对称（技术方案 §6.1）：
// 全局默认要求 Bearer（与 AuthGuard 默认锁死一致），公开接口在各自的 @ApiOperation 中
// 显式 security: [] 豁免（与代码中必须显式标 @Public() 对称）。
export function buildApiDocument(app: INestApplication): OpenAPIObject {
  const config = new DocumentBuilder()
    .setTitle('MCC 业务 API')
    .setDescription('梅好木业数字化系统统一业务 API（ADR-002：人与 Agent 平级消费同一套接口）')
    .setVersion('v1')
    .addTag('auth', '账号与权限')
    .addBearerAuth(
      { type: 'http', scheme: 'bearer', bearerFormat: 'JWT', description: '登录/刷新接口返回的 accessToken' },
      'bearerAuth',
    )
    .build();
  const document = SwaggerModule.createDocument(app, config);
  // addBearerAuth 只注册 securitySchemes 不挂全局要求（Nest Swagger 现有行为），
  // 全局默认 Bearer 在此兜底；公开接口以 operation 级 security: [] 覆盖（OpenAPI 语义：操作级覆盖全局）
  document.security = [{ bearerAuth: [] }];
  return document;
}