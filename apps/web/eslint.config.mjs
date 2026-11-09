import { baseConfig } from '@mcc/config/eslint.base.mjs';

// web 侧 lint：浏览器全局变量 + 全仓共享基础规则。
// 两条交互纪律从 CI 层强制（文档见 product/平台布局.md、design/平台布局.md）：
// 1) 禁止浏览器原生弹窗——二次确认统一走应用内确认组件；
// 2) 禁止页面直接写原生 select / input[type=date]——下拉与日期统一走 components/ui 封装。
export default [
  ...baseConfig({ browser: true }),
  {
    rules: {
      'no-alert': 'error',
    },
  },
  {
    files: ['app/**/*.tsx', 'components/**/*.tsx'],
    ignores: ['components/ui/**'],
    rules: {
      'no-restricted-syntax': [
        'error',
        {
          selector: "JSXOpeningElement[name.name='select']",
          message: '禁止直接使用原生 select，请使用 @/components/ui/select',
        },
        {
          selector:
            "JSXOpeningElement[name.name='input'] > JSXAttribute[name.name='type'][value.value='date']",
          message: '禁止直接使用原生日期输入，请使用 @/components/ui/date-picker',
        },
      ],
    },
  },
];
