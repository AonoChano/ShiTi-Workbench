/**
 * 认证相关的全部可配置项集中在这里。
 * 同源部署：API 走 /api/v1（vite dev 由代理转发，生产由同源 Fastify 提供）。
 */

/** 认证接口路径（相对 API_BASE_URL） */
export const AUTH_ENDPOINTS = {
  login: "/auth/login", //            POST  登录
  register: "/auth/register", //      POST  注册
  forgotPassword: "/auth/password/forgot", // POST 找回密码
  logout: "/auth/logout", //          POST  退出
  session: "/auth/me", //             GET   读取当前会话
} as const;

/** 法律条款链接（自托管部署：指向仓库说明） */
export const LEGAL_LINKS = {
  terms: "https://github.com/AonoChano/ShiTi-Workbench#readme",
  privacy: "https://github.com/AonoChano/ShiTi-Workbench#readme",
} as const;

/** 登录成功后，在转场前停留多久展示"对勾"（毫秒） */
export const SUCCESS_BEAT_MS = 700;
