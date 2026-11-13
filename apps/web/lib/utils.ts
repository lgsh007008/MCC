import { createCn } from "cn/config"

// 移动端字号角色（packages/config/tailwind/theme.css 的 @theme inline）以 text-mobile-* 命名，
// cn 默认分组不认识这些键，会把它们当作文字颜色：与 text-primary-foreground 等同时出现时，
// 后写的字号类会删掉前面的颜色类（症状：主色按钮变绿底黑字）。这里显式登记为字号组。
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
          ],
        },
      ],
    },
  },
})
