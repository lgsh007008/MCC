// 唯一公开出口（技术方案 §4.2）：他模块只许经此引用，禁止深入内部实现。
export { OrderService } from './order.service.js';
export { OrderModule } from './order.module.js';