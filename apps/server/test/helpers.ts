import type { FastifyInstance } from 'fastify';

/** 测试环境管理员密码（buildApp 的 adminPassword 选项） */
export const TEST_ADMIN_PASSWORD = 'test-admin-1';

/** 登录管理员并返回 Cookie 头（后续 app.inject 请求都带上） */
export async function loginCookie(app: FastifyInstance): Promise<string> {
  const res = await app.inject({
    method: 'POST',
    url: '/api/v1/auth/login',
    payload: { account: 'AonoChano', password: TEST_ADMIN_PASSWORD, remember: false },
  });
  if (res.statusCode !== 200) throw new Error(`测试登录失败：${res.statusCode} ${res.body}`);
  const raw = res.headers['set-cookie'];
  const header = Array.isArray(raw) ? raw.join('\n') : raw ?? '';
  const pair = header.split(';')[0]?.trim();
  if (!pair?.startsWith('shiti_session=')) throw new Error(`测试登录未拿到会话 Cookie：${header}`);
  return pair;
}
