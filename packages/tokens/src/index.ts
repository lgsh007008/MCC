// 设计令牌的类型化出口：供需要以 TS 常量引用令牌的代码使用（如小程序端）。
// 真正的取值源在 tokens.css 的 CSS 变量，二者保持一致。
export const tokens = {
  color: {
    bg: '#ffffff',
    fg: '#1a1a1a',
    primary: '#16653c',
    border: '#e5e7eb',
  },
  fontSizeBase: 15,
  spaceUnit: 4,
  radiusBase: 8,
  touchTarget: 44,
} as const;

export type Tokens = typeof tokens;
