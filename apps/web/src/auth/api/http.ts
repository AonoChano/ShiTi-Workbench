import { AUTH_ENDPOINTS } from "./config";
import { ApiError, type ApiErrorCode, type AuthFieldName } from "./errors";

/**
 * 任意请求收到 401（且不是登录 / 注册本身）时，会在 window 上派发此事件，
 * AuthProvider 监听它并回到登录页。
 * 拾题主应用的 api() 客户端在 401 时也会派发同一事件，保持会话状态一致。
 */
export const UNAUTHORIZED_EVENT = "shiti:unauthorized";

interface RequestOptions {
  method?: "GET" | "POST" | "PUT" | "PATCH" | "DELETE";
  body?: unknown;
  signal?: AbortSignal;
}

interface ErrorBody {
  code?: string;
  message?: string;
  fieldErrors?: Partial<Record<AuthFieldName, string>>;
}

function statusToCode(status: number): ApiErrorCode {
  if (status === 401) return "UNAUTHORIZED";
  if (status === 423) return "ACCOUNT_LOCKED";
  if (status === 429) return "RATE_LIMITED";
  if (status === 409) return "EMAIL_TAKEN";
  if (status === 422) return "VALIDATION_FAILED";
  return "UNKNOWN";
}

function parseJson(text: string): unknown {
  try {
    return JSON.parse(text);
  } catch {
    return null;
  }
}

const AUTH_ATTEMPT_PATHS: string[] = [AUTH_ENDPOINTS.login, AUTH_ENDPOINTS.register];

/**
 * 轻量 fetch 封装：会话由 httpOnly Cookie 维持（credentials: include）。
 * 非 2xx 一律抛 ApiError；服务端错误体形如 { error: { code, message, fieldErrors } }。
 */
export async function request<T>(path: string, options: RequestOptions = {}): Promise<T> {
  const { method = "GET", body, signal } = options;

  const headers: Record<string, string> = { Accept: "application/json" };
  if (body !== undefined) headers["Content-Type"] = "application/json";

  let res: Response;
  try {
    res = await fetch(`/api/v1${path}`, {
      method,
      headers,
      credentials: "include",
      body: body !== undefined ? JSON.stringify(body) : undefined,
      signal,
    });
  } catch (err) {
    if (err instanceof DOMException && err.name === "AbortError") throw err;
    throw new ApiError("NETWORK", "", { status: 0 });
  }

  const text = await res.text();
  const data = text ? parseJson(text) : null;

  if (!res.ok) {
    if (res.status === 401 && !AUTH_ATTEMPT_PATHS.includes(path)) {
      window.dispatchEvent(new Event(UNAUTHORIZED_EVENT));
    }
    const container = (data ?? {}) as Record<string, unknown>;
    const errBody = ((container["error"] ?? container) ?? {}) as ErrorBody;
    throw new ApiError((errBody.code as ApiErrorCode | undefined) ?? statusToCode(res.status), errBody.message ?? "", {
      status: res.status,
      body: errBody,
    });
  }

  return data as T;
}
