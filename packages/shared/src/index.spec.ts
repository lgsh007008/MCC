import { describe, expect, it } from 'vitest';
import { paginationQuerySchema } from './index';

// 脚手架自检用例：证明单元测试链路（vitest + tsconfig + turbo）可跑。
// 各领域的真实用例随需求写入，与源码同目录。
describe('分页查询校验（技术方案 §6.3）', () => {
  it('缺省时取默认分页', () => {
    expect(paginationQuerySchema.parse({})).toEqual({ page: 1, pageSize: 20 });
  });

  it('把字符串入参强制转为数字', () => {
    expect(paginationQuerySchema.parse({ page: '3', pageSize: '50' })).toEqual({
      page: 3,
      pageSize: 50,
    });
  });

  it('拒绝越界分页', () => {
    expect(() => paginationQuerySchema.parse({ page: 0 })).toThrow();
    expect(() => paginationQuerySchema.parse({ pageSize: 101 })).toThrow();
  });
});
