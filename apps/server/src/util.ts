import type { FastifyReply } from 'fastify';

export function ok(reply: FastifyReply, data: unknown, meta?: Record<string, unknown>): FastifyReply {
  return reply.code(200).send({ data, meta: { request_id: reply.request.id, ...meta } });
}

export function fail(
  reply: FastifyReply,
  status: number,
  code: string,
  message: string,
  extra?: Record<string, unknown>,
): FastifyReply {
  return reply.code(status).send({
    error: { code, message, retryable: status >= 500 || code === 'SAVE_FAILED', ...extra },
    request_id: reply.request.id,
  });
}

export class HttpError extends Error {
  constructor(
    public status: number,
    public code: string,
    message: string,
    public extra?: Record<string, unknown>,
  ) {
    super(message);
  }
}

/** 路由内部抛 HttpError，由统一的 setErrorHandler 落成契约错误体。 */
export function notFound(message = '找不到这条记录'): HttpError {
  return new HttpError(404, 'NOT_FOUND', message);
}

export function conflict(code: string, message: string, extra?: Record<string, unknown>): HttpError {
  return new HttpError(409, code, message, extra);
}

export function badRequest(code: string, message: string, extra?: Record<string, unknown>): HttpError {
  return new HttpError(400, code, message, extra);
}

export function unprocessable(code: string, message: string, extra?: Record<string, unknown>): HttpError {
  return new HttpError(422, code, message, extra);
}

export function nowIso(): string {
  return new Date().toISOString();
}
