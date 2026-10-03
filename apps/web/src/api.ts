/** 极简 API 客户端：同源 /api/v1，统一错误体处理。 */

export interface ApiError extends Error {
  code: string;
  status: number;
  retryable: boolean;
}

export async function api<T = unknown>(method: string, path: string, body?: unknown, headers?: Record<string, string>): Promise<T> {
  const res = await fetch(`/api/v1${path}`, {
    method,
    headers: { 'content-type': 'application/json', ...headers },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  const json = (await res.json().catch(() => ({}))) as Record<string, unknown>;
  if (!res.ok) {
    const err = (json['error'] ?? {}) as Record<string, unknown>;
    const e = new Error(String(err['message'] ?? `请求失败（${res.status}）`)) as ApiError;
    e.code = String(err['code'] ?? 'UNKNOWN');
    e.status = res.status;
    e.retryable = Boolean(err['retryable']);
    throw e;
  }
  return (json['data'] ?? json) as T;
}

export function uuid(): string {
  if (typeof crypto !== 'undefined' && 'randomUUID' in crypto) return crypto.randomUUID();
  return `id-${Date.now()}-${Math.random().toString(36).slice(2)}`;
}
