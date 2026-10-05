import { AUTH_ENDPOINTS } from "./config";
import { ApiError } from "./errors";
import { request } from "./http";

/* ==================================================================
 * 1. 数据契约
 * ================================================================== */

export interface AuthUser {
  id: string;
  nickname: string;
  username?: string;
  email?: string;
  avatarUrl?: string;
}

export interface LoginPayload {
  /** 邮箱或用户名 */
  account: string;
  password: string;
  /** 保持登录：服务端据此签发 30 天持久 Cookie，否则为浏览器会话级 */
  remember: boolean;
}

export interface RegisterPayload {
  nickname: string;
  email: string;
  password: string;
}

export interface ForgotPasswordPayload {
  email: string;
}

export interface AuthResult {
  user: AuthUser;
}

export interface AuthApi {
  login(payload: LoginPayload): Promise<AuthResult>;
  register(payload: RegisterPayload): Promise<AuthResult>;
  forgotPassword(payload: ForgotPasswordPayload): Promise<void>;
  /** 返回当前登录用户；未登录返回 null（不要抛错） */
  getSession(): Promise<AuthUser | null>;
  logout(): Promise<void>;
}

/* ==================================================================
 * 2. 服务端实现（会话由 httpOnly Cookie 维持）
 * ================================================================== */

const unwrapUser = (body: unknown): AuthUser => (body as { data?: { user?: AuthUser } })?.data?.user as AuthUser;

export const authApi: AuthApi = {
  // POST /auth/login      body: LoginPayload              → 200 { data: { user } }
  login: async (payload) => {
    const body = await request<unknown>(AUTH_ENDPOINTS.login, { method: "POST", body: payload });
    return { user: unwrapUser(body) };
  },

  // POST /auth/register   body: RegisterPayload           → 201 { data: { user } }
  register: async (payload) => {
    const body = await request<unknown>(AUTH_ENDPOINTS.register, { method: "POST", body: payload });
    return { user: unwrapUser(body) };
  },

  // POST /auth/password/forgot  body: { email }
  // 本部署未配置邮件服务时，服务端返回 503 与说明文案（不再假装发送成功）
  forgotPassword: async (payload) => {
    await request<unknown>(AUTH_ENDPOINTS.forgotPassword, { method: "POST", body: payload });
  },

  // GET /auth/me                                          → 200 { data: { user } }；未登录 401
  getSession: async () => {
    try {
      const body = await request<{ data?: { user?: AuthUser } }>(AUTH_ENDPOINTS.session);
      return body?.data?.user ?? null;
    } catch (err) {
      if (err instanceof ApiError && err.code === "UNAUTHORIZED") return null;
      throw err;
    }
  },

  // POST /auth/logout                                     → 200
  logout: async () => {
    await request<unknown>(AUTH_ENDPOINTS.logout, { method: "POST" });
  },
};
