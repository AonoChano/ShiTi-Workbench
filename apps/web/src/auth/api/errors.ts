/**
 * 统一的接口错误。
 *
 * 后端出错时返回的 JSON 结构（HTTP 状态码 4xx / 5xx）：
 *   { "error": { "code": "INVALID_CREDENTIALS", "message": "给人看的文案", "fieldErrors": { "email": "该邮箱已注册" } } }
 * `code` 不在下表内也没关系，会走 UNKNOWN 分支并优先展示 message。
 */
export type ApiErrorCode =
  | "INVALID_CREDENTIALS" // 账号或密码错误
  | "ACCOUNT_LOCKED" //      多次失败被临时锁定
  | "ACCOUNT_DISABLED" //    账号被停用
  | "EMAIL_TAKEN" //         注册邮箱已存在
  | "VALIDATION_FAILED" //   字段校验未通过（可带 fieldErrors）
  | "RATE_LIMITED" //        请求过于频繁
  | "UNAUTHORIZED" //        未登录 / 会话过期
  | "NETWORK" //             网络不通 / 跨域失败
  | "UNKNOWN";

export type AuthFieldName = "account" | "password" | "nickname" | "email" | "agree";

interface ErrorBody {
  code?: string;
  message?: string;
  fieldErrors?: Partial<Record<AuthFieldName, string>>;
}

export class ApiError extends Error {
  readonly code: ApiErrorCode;
  readonly status: number;
  readonly fieldErrors?: Partial<Record<AuthFieldName, string>>;

  constructor(
    code: ApiErrorCode,
    message = "",
    options: { status?: number; body?: ErrorBody | null } = {},
  ) {
    super(message || options.body?.message || "");
    this.name = "ApiError";
    this.code = code;
    this.status = options.status ?? 0;
    this.fieldErrors = options.body?.fieldErrors;
  }
}

/** 把任意错误转成给用户看的中文文案 */
export function getErrorMessage(err: unknown): string {
  if (!(err instanceof ApiError)) return "出了点小问题，请稍后再试。";

  switch (err.code) {
    case "INVALID_CREDENTIALS":
      return "账号或密码不正确，请再检查一下。";
    case "ACCOUNT_LOCKED":
      return "尝试次数过多，账号已被暂时锁定，请稍后再试。";
    case "ACCOUNT_DISABLED":
      return "该账号已被停用，如有疑问请联系管理员。";
    case "EMAIL_TAKEN":
      return "这个邮箱已经注册过了，直接登录就好。";
    case "RATE_LIMITED":
      return "操作太频繁了，请稍等片刻再试。";
    case "NETWORK":
      return "连不上服务器，请检查网络后重试。";
    case "UNAUTHORIZED":
      return "登录状态已失效，请重新登录。";
    case "VALIDATION_FAILED":
      return err.message || "提交的信息有误，请检查后重试。";
    default:
      return err.message || "出了点小问题，请稍后再试。";
  }
}
