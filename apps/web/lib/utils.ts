import { createCn } from "cn/config"

// 自定义字号令牌（packages/config/tailwind/theme.css 的 @theme inline）必须在此登记：
// cn 默认分组不认识这些键，会把它们当作文字颜色；与 text-foreground 等同时出现时，
// 后写的颜色类会删掉字号类（症状：字号回退到 16px、主色按钮变绿底黑字）。
// 新增任何 text-* 字号令牌，都要同步加入 font-size 组。
export const cn = createCn({
  extend: {
    classGroups: {
      "font-size": [
        {
          text: [
            "mobile-title",
            "mobile-body",
            "mobile-label",
            "mobile-caption",
            "mobile-numeric",
            "mobile-numeric-strong",
            "wb-body",
            "wb-meta",
          ],
        },
      ],
    },
  },
})
