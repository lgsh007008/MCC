// 访问令牌的网页端存储（design/账号与权限.md §4、§7）：
// 只存内存、不落 localStorage 等任何持久存储——页面刷新即丢，
// 登录态由 httpOnly Cookie 里的刷新令牌经 refresh 接口静默恢复。
let accessToken: string | null = null;

export const authSession = {
  get(): string | null {
    return accessToken;
  },
  set(token: string): void {
    accessToken = token;
  },
  clear(): void {
    accessToken = null;
  },
};