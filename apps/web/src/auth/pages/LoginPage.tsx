import { useEffect, useRef, useState, type CSSProperties, type FormEvent, type KeyboardEvent } from "react";
import { ArrowLeft, ArrowRight, CircleAlert, Eye, EyeOff, Lock, Mail, MailCheck, User, UserRound } from "lucide-react";
import { authApi, type AuthResult } from "../api/auth";
import { LEGAL_LINKS, SUCCESS_BEAT_MS } from "../api/config";
import { ApiError, getErrorMessage, type AuthFieldName } from "../api/errors";
import { useAuth } from "../AuthContext";
import { AuthButton } from "../components/auth/AuthButton";
import { AuthCheckbox } from "../components/auth/AuthCheckbox";
import { AuthField } from "../components/auth/AuthField";
import { BrandMark } from "../components/auth/BrandMark";
import { CoverPanel, type AuthMode } from "../components/auth/CoverPanel";
import { cn } from "../utils/cn";

/* ------------------------------------------------------------------
 * 文案 / 常量 / 纯函数
 * ------------------------------------------------------------------ */

const HEADINGS: Record<AuthMode, { eyebrow: string; title: string; sub: string }> = {
  login: { eyebrow: "Welcome back", title: "登录", sub: "用邮箱或用户名，回到你的题库。" },
  register: { eyebrow: "Create account", title: "创建账号", sub: "只需几项信息，就能开始第一套真题。" },
  forgot: { eyebrow: "Reset password", title: "找回密码", sub: "输入注册邮箱，我们会把重置链接发给你。" },
};

const SUBMIT_COPY: Record<AuthMode, { idle: string; loading: string; success?: string }> = {
  login: { idle: "登录", loading: "正在登录…", success: "登录成功" },
  register: { idle: "创建账号", loading: "正在创建…", success: "创建成功" },
  forgot: { idle: "发送重置邮件", loading: "正在发送…" },
};

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const FIELD_ORDER: AuthFieldName[] = ["account", "nickname", "email", "password", "agree"];

type FieldErrors = Partial<Record<AuthFieldName, string>>;

interface FormValues {
  account: string;
  password: string;
  nickname: string;
  email: string;
  remember: boolean;
  agree: boolean;
}

const INITIAL_VALUES: FormValues = {
  account: "",
  password: "",
  nickname: "",
  email: "",
  remember: true,
  agree: false,
};

const stagger = (i: number) => ({ "--i": i }) as CSSProperties;
const sleep = (ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms));
const focusField = (name: AuthFieldName) => requestAnimationFrame(() => document.getElementById(`auth-${name}`)?.focus());

function validate(mode: AuthMode, v: FormValues): FieldErrors {
  const errors: FieldErrors = {};

  if (mode === "login") {
    if (!v.account.trim()) errors.account = "请输入邮箱或用户名";
    if (!v.password) errors.password = "请输入密码";
    return errors;
  }

  if (mode === "register") {
    const nick = v.nickname.trim();
    if (!nick) errors.nickname = "请取一个昵称";
    else if (nick.length < 2 || nick.length > 16) errors.nickname = "昵称需要 2–16 个字符";

    if (!v.password) errors.password = "请设置密码";
    else if (v.password.length < 8 || !/[a-zA-Z]/.test(v.password) || !/\d/.test(v.password))
      errors.password = "至少 8 位，需同时包含字母和数字";

    if (!v.agree) errors.agree = "请先阅读并同意服务条款与隐私政策";
  }

  const email = v.email.trim();
  if (!email) errors.email = "请输入邮箱";
  else if (!EMAIL_RE.test(email)) errors.email = "邮箱格式好像不太对";

  return errors;
}

function passwordScore(pw: string): 0 | 1 | 2 | 3 {
  if (!pw) return 0;
  let score = 0;
  if (pw.length >= 8) score++;
  if (/[a-zA-Z]/.test(pw) && /\d/.test(pw)) score++;
  if (pw.length >= 12 || /[^\w\s]/.test(pw)) score++;
  return Math.max(score, 1) as 1 | 2 | 3;
}

/* ------------------------------------------------------------------
 * 小组件
 * ------------------------------------------------------------------ */

function PasswordMeter({ value }: { value: string }) {
  if (!value) return null;
  const score = passwordScore(value);
  const label = ["", "偏弱", "还不错", "很稳"][score];
  const tone = score === 1 ? "bg-wheat" : score === 2 ? "bg-fill" : "bg-leaf";

  return (
    <div className="flex items-center gap-2.5 pt-0.5" aria-live="polite">
      <div className="flex flex-1 gap-1" aria-hidden="true">
        {[1, 2, 3].map((i) => (
          <span
            key={i}
            className={cn("h-[3px] flex-1 rounded-full transition-colors duration-300", i <= score ? tone : "bg-wash")}
          />
        ))}
      </div>
      <span className="text-meta text-muted">强度 · {label}</span>
    </div>
  );
}

function LegalLinks() {
  const cls = "text-option underline decoration-fill-soft underline-offset-[3px] hover:text-heading hover:decoration-leaf";
  return (
    <>
      <a href={LEGAL_LINKS.terms} className={cls} target="_blank" rel="noreferrer">
        服务条款
      </a>
      {" 与 "}
      <a href={LEGAL_LINKS.privacy} className={cls} target="_blank" rel="noreferrer">
        隐私政策
      </a>
    </>
  );
}

/* ------------------------------------------------------------------
 * 登录页
 * ------------------------------------------------------------------ */

export default function LoginPage({ initialMode = "login" }: { initialMode?: AuthMode }) {
  const { signIn } = useAuth();

  const [mode, setMode] = useState<AuthMode>(initialMode);
  const [values, setValues] = useState<FormValues>(INITIAL_VALUES);
  const [errors, setErrors] = useState<FieldErrors>({});
  const [formError, setFormError] = useState<string | null>(null);
  const [phase, setPhase] = useState<"idle" | "submitting" | "success">("idle");
  const [showPassword, setShowPassword] = useState(false);
  const [capsOn, setCapsOn] = useState(false);
  const [sentTo, setSentTo] = useState<string | null>(null);

  const formRef = useRef<HTMLFormElement>(null);
  const prevMode = useRef<AuthMode>(mode);

  const busy = phase !== "idle";
  const heading = HEADINGS[mode];
  const submitCopy = SUBMIT_COPY[mode];

  // 切换模式后，把焦点交给新表单的第一个输入框（首次进入页面不抢焦点）
  useEffect(() => {
    if (prevMode.current === mode) return;
    prevMode.current = mode;
    formRef.current?.querySelector<HTMLInputElement>("input:not([type=checkbox])")?.focus();
  }, [mode]);

  function update<K extends keyof FormValues>(key: K, value: FormValues[K]) {
    setValues((prev) => ({ ...prev, [key]: value }));
    setFormError(null);
    setErrors((prev) => {
      if (!prev[key as AuthFieldName]) return prev;
      const next = { ...prev };
      delete next[key as AuthFieldName];
      return next;
    });
  }

  function switchMode(next: AuthMode) {
    if (next === mode || busy) return;
    setMode(next);
    setErrors({});
    setFormError(null);
    setSentTo(null);
    setShowPassword(false);
    setCapsOn(false);
    setValues((prev) => ({ ...prev, password: "", agree: false }));
  }

  function handleFailure(err: unknown) {
    if (err instanceof ApiError && err.fieldErrors && Object.keys(err.fieldErrors).length > 0) {
      setErrors(err.fieldErrors);
      const first = FIELD_ORDER.find((k) => err.fieldErrors?.[k]);
      if (first) focusField(first);
      return;
    }
    setFormError(getErrorMessage(err));
    if (mode === "login" && err instanceof ApiError && err.code === "INVALID_CREDENTIALS") {
      setValues((prev) => ({ ...prev, password: "" }));
      focusField("password");
    }
  }

  /** 接口成功 → 停一拍展示对勾 → 交给 AuthProvider 切到已登录状态 */
  async function completeSignIn(result: AuthResult, remember: boolean) {
    setPhase("success");
    await sleep(SUCCESS_BEAT_MS);
    signIn(result, { remember });
  }

  async function handleSubmit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    if (busy) return;

    setFormError(null);
    const found = validate(mode, values);
    setErrors(found);
    const firstInvalid = FIELD_ORDER.find((k) => found[k]);
    if (firstInvalid) {
      focusField(firstInvalid);
      return;
    }

    setPhase("submitting");
    try {
      if (mode === "login") {
        const result = await authApi.login({
          account: values.account.trim(),
          password: values.password,
          remember: values.remember,
        });
        await completeSignIn(result, values.remember);
      } else if (mode === "register") {
        const result = await authApi.register({
          nickname: values.nickname.trim(),
          email: values.email.trim(),
          password: values.password,
        });
        await completeSignIn(result, true);
      } else {
        await authApi.forgotPassword({ email: values.email.trim() });
        setSentTo(values.email.trim());
        setPhase("idle");
      }
    } catch (err) {
      setPhase("idle");
      handleFailure(err);
    }
  }

  const checkCaps = (e: KeyboardEvent<HTMLInputElement>) => setCapsOn(e.getModifierState("CapsLock"));

  const submitState = phase === "submitting" ? "loading" : phase === "success" ? "success" : "idle";

  const passwordToggle = (
    <button
      type="button"
      onClick={() => setShowPassword((s) => !s)}
      aria-label={showPassword ? "隐藏密码" : "显示密码"}
      aria-pressed={showPassword}
      className="grid size-8 place-items-center rounded-input text-faint transition-colors hover:text-option"
    >
      {showPassword ? (
        <EyeOff className="size-[15px]" strokeWidth={1.65} aria-hidden="true" />
      ) : (
        <Eye className="size-[15px]" strokeWidth={1.65} aria-hidden="true" />
      )}
    </button>
  );

  return (
    <div className="relative min-h-screen">
      {/* 练习册横线底纹 */}
      <div aria-hidden="true" className="ruled-bg pointer-events-none fixed inset-0" />

      <main className="relative flex min-h-screen flex-col items-center justify-center px-4 py-8 sm:px-8">
        <div className="reveal grid w-full max-w-[480px] overflow-hidden rounded-panel border border-line bg-card shadow-float lg:max-w-[1000px] lg:grid-cols-[1.04fr_1fr]">
          <CoverPanel mode={mode} />

          <section className="px-6 py-9 sm:px-10 sm:py-11">
            <div className="mx-auto w-full max-w-[380px]">
              <BrandMark size="sm" className="mb-9 lg:hidden" />

              {/* 标题区 */}
              <header key={`head-${mode}`} className="reveal-fast">
                {mode === "forgot" && (
                  <button
                    type="button"
                    onClick={() => switchMode("login")}
                    className="group mb-5 inline-flex items-center gap-1.5 text-ui text-muted transition-colors hover:text-heading"
                  >
                    <ArrowLeft className="size-3.5 transition-transform group-hover:-translate-x-0.5" strokeWidth={1.8} />
                    返回登录
                  </button>
                )}
                <p className="eyebrow">{heading.eyebrow}</p>
                <h1 className="mt-2 text-[25px] font-semibold leading-[1.2] tracking-[-0.8px] text-heading">{heading.title}</h1>
                <p className="mt-2 text-ui leading-[1.7] text-muted">{heading.sub}</p>
              </header>

              {/* 登录 / 注册 切换 */}
              {mode !== "forgot" && (
                <div
                  role="group"
                  aria-label="登录或注册"
                  className="reveal-fast mt-6 grid grid-cols-2 gap-1 rounded-chip bg-wash p-[3px]"
                  style={stagger(1)}
                >
                  {(["login", "register"] as const).map((m) => (
                    <button
                      key={m}
                      type="button"
                      aria-pressed={mode === m}
                      onClick={() => switchMode(m)}
                      className={cn(
                        "h-[30px] rounded-input text-ui font-medium transition-[background-color,color,box-shadow] duration-200",
                        mode === m
                          ? "bg-card text-heading shadow-[0_1px_2px_#2339171a] ring-1 ring-line"
                          : "text-muted hover:text-heading",
                      )}
                    >
                      {m === "login" ? "登录" : "注册"}
                    </button>
                  ))}
                </div>
              )}

              {/* 找回密码：已发送 */}
              {mode === "forgot" && sentTo ? (
                <div role="status" className="reveal-fast mt-6 space-y-3" style={stagger(1)}>
                  <div className="flex gap-3 rounded-card border border-line bg-material p-4">
                    <span className="grid size-[34px] shrink-0 place-items-center rounded-chip bg-sage-block text-action">
                      <MailCheck className="size-[17px]" strokeWidth={1.7} aria-hidden="true" />
                    </span>
                    <div className="min-w-0">
                      <p className="text-[14px] font-semibold text-heading">邮件已发出</p>
                      <p className="mt-1 text-ui leading-[1.75] text-muted">
                        如果 <span className="break-all font-medium text-body">{sentTo}</span>{" "}
                        已注册，几分钟内会收到重置链接。没收到的话，看看垃圾邮件箱。
                      </p>
                    </div>
                  </div>
                  <AuthButton onClick={() => switchMode("login")}>返回登录</AuthButton>
                  <AuthButton variant="quiet" onClick={() => setSentTo(null)}>
                    换个邮箱重新发送
                  </AuthButton>
                </div>
              ) : (
                <form key={mode} ref={formRef} onSubmit={handleSubmit} noValidate className="mt-6 space-y-4">
                  {formError && (
                    <div
                      role="alert"
                      className="reveal-fast flex items-start gap-2 rounded-input border border-clay-line bg-clay-wash px-3 py-2.5 text-ui leading-[1.6] text-clay-ink"
                    >
                      <CircleAlert className="mt-[2px] size-[14px] shrink-0" strokeWidth={1.8} aria-hidden="true" />
                      <span>{formError}</span>
                    </div>
                  )}

                  {mode === "login" && (
                    <>
                      <div className="reveal-fast" style={stagger(2)}>
                        <AuthField
                          id="auth-account"
                          label="邮箱或用户名"
                          icon={User}
                          placeholder="name@example.com"
                          autoComplete="username"
                          autoCapitalize="none"
                          spellCheck={false}
                          readOnly={busy}
                          value={values.account}
                          error={errors.account}
                          onChange={(e) => update("account", e.target.value)}
                        />
                      </div>
                      <div className="reveal-fast" style={stagger(3)}>
                        <AuthField
                          id="auth-password"
                          label="密码"
                          icon={Lock}
                          type={showPassword ? "text" : "password"}
                          placeholder="输入密码"
                          autoComplete="current-password"
                          readOnly={busy}
                          value={values.password}
                          error={errors.password}
                          warning={capsOn ? "大写锁定已开启" : undefined}
                          trailing={passwordToggle}
                          onChange={(e) => update("password", e.target.value)}
                          onKeyDown={checkCaps}
                          onKeyUp={checkCaps}
                          onBlur={() => setCapsOn(false)}
                        />
                      </div>
                      <div className="reveal-fast flex items-center justify-between gap-3 pt-0.5" style={stagger(4)}>
                        <AuthCheckbox
                          checked={values.remember}
                          disabled={busy}
                          onChange={(e) => update("remember", e.target.checked)}
                        >
                          保持登录
                        </AuthCheckbox>
                        <button
                          type="button"
                          onClick={() => switchMode("forgot")}
                          className="text-small text-option underline-offset-4 transition-colors hover:text-heading hover:underline"
                        >
                          忘记密码？
                        </button>
                      </div>
                    </>
                  )}

                  {mode === "register" && (
                    <>
                      <div className="reveal-fast" style={stagger(2)}>
                        <AuthField
                          id="auth-nickname"
                          label="昵称"
                          icon={UserRound}
                          placeholder="2–16 个字符"
                          autoComplete="nickname"
                          maxLength={16}
                          readOnly={busy}
                          value={values.nickname}
                          error={errors.nickname}
                          onChange={(e) => update("nickname", e.target.value)}
                        />
                      </div>
                      <div className="reveal-fast" style={stagger(3)}>
                        <AuthField
                          id="auth-email"
                          label="邮箱"
                          icon={Mail}
                          type="email"
                          placeholder="name@example.com"
                          autoComplete="email"
                          autoCapitalize="none"
                          spellCheck={false}
                          readOnly={busy}
                          value={values.email}
                          error={errors.email}
                          onChange={(e) => update("email", e.target.value)}
                        />
                      </div>
                      <div className="reveal-fast" style={stagger(4)}>
                        <AuthField
                          id="auth-password"
                          label="密码"
                          icon={Lock}
                          type={showPassword ? "text" : "password"}
                          placeholder="设置密码"
                          autoComplete="new-password"
                          readOnly={busy}
                          value={values.password}
                          error={errors.password}
                          hint={values.password ? undefined : "至少 8 位，需同时包含字母和数字"}
                          warning={capsOn ? "大写锁定已开启" : undefined}
                          trailing={passwordToggle}
                          footer={<PasswordMeter value={values.password} />}
                          onChange={(e) => update("password", e.target.value)}
                          onKeyDown={checkCaps}
                          onKeyUp={checkCaps}
                          onBlur={() => setCapsOn(false)}
                        />
                      </div>
                      <div className="reveal-fast" style={stagger(5)}>
                        <AuthCheckbox
                          id="auth-agree"
                          checked={values.agree}
                          disabled={busy}
                          error={errors.agree}
                          onChange={(e) => update("agree", e.target.checked)}
                        >
                          我已阅读并同意 <LegalLinks />
                        </AuthCheckbox>
                      </div>
                    </>
                  )}

                  {mode === "forgot" && (
                    <div className="reveal-fast" style={stagger(2)}>
                      <AuthField
                        id="auth-email"
                        label="注册邮箱"
                        icon={Mail}
                        type="email"
                        placeholder="name@example.com"
                        autoComplete="email"
                        autoCapitalize="none"
                        spellCheck={false}
                        readOnly={busy}
                        value={values.email}
                        error={errors.email}
                        onChange={(e) => update("email", e.target.value)}
                      />
                    </div>
                  )}

                  <div className="reveal-fast pt-1" style={stagger(6)}>
                    <AuthButton
                      type="submit"
                      className="group"
                      state={submitState}
                      loadingText={submitCopy.loading}
                      successText={submitCopy.success}
                    >
                      {submitCopy.idle}
                      {mode !== "forgot" && (
                        <ArrowRight
                          className="size-4 transition-transform duration-200 group-hover:translate-x-0.5"
                          strokeWidth={1.8}
                          aria-hidden="true"
                        />
                      )}
                    </AuthButton>
                  </div>

                  {mode === "login" && (
                    <p className="reveal-fast text-center text-meta leading-[1.8] text-muted" style={stagger(7)}>
                      登录即表示同意 <LegalLinks />
                    </p>
                  )}
                </form>
              )}

            </div>
          </section>
        </div>

        <footer className="meta-row reveal mt-6 justify-center text-meta text-muted" style={stagger(6)}>
          <span>拾题</span>
          <span>考研英语真题练习</span>
          <span>安静做题</span>
        </footer>
      </main>
    </div>
  );
}
