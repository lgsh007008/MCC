import { baseConfig } from '@mcc/config/eslint.base.mjs';

// web 侧 lint：浏览器全局变量 + 全仓共享基础规则
export default baseConfig({ browser: true });