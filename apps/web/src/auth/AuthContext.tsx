import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from "react";
import { authApi, type AuthResult, type AuthUser } from "./api/auth";
import { UNAUTHORIZED_EVENT } from "./api/http";

/**
 * 全局登录状态。
 *   checking        启动时正在向后端确认会话（显示极简的等待页）
 *   anonymous       未登录 → 显示登录页
 *   authenticated   已登录 → 显示拾题主应用
 */
export type AuthStatus = "checking" | "anonymous" | "authenticated";

interface AuthContextValue {
  status: AuthStatus;
  user: AuthUser | null;
  /** 登录 / 注册接口成功后调用：切换到已登录状态 */
  signIn: (result: AuthResult, options?: { remember?: boolean }) => void;
  /** 退出登录：通知后端、回到登录页 */
  signOut: () => Promise<void>;
}

const AuthContext = createContext<AuthContextValue | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [status, setStatus] = useState<AuthStatus>("checking");
  const [user, setUser] = useState<AuthUser | null>(null);

  // 启动时恢复会话
  useEffect(() => {
    let cancelled = false;
    authApi
      .getSession()
      .then((sessionUser) => {
        if (cancelled) return;
        if (sessionUser) {
          setUser(sessionUser);
          setStatus("authenticated");
        } else {
          setStatus("anonymous");
        }
      })
      .catch(() => {
        if (!cancelled) setStatus("anonymous");
      });
    return () => {
      cancelled = true;
    };
  }, []);

  // 任意接口返回 401 → 回到登录页
  useEffect(() => {
    const onUnauthorized = () => {
      setUser(null);
      setStatus("anonymous");
    };
    window.addEventListener(UNAUTHORIZED_EVENT, onUnauthorized);
    return () => window.removeEventListener(UNAUTHORIZED_EVENT, onUnauthorized);
  }, []);

  const signIn = useCallback<AuthContextValue["signIn"]>((result) => {
    setUser(result.user);
    setStatus("authenticated");
  }, []);

  const signOut = useCallback(async () => {
    try {
      await authApi.logout();
    } catch {
      /* 即使后端失败，本地也要退出 */
    }
    setUser(null);
    setStatus("anonymous");
  }, []);

  const value = useMemo(() => ({ status, user, signIn, signOut }), [status, user, signIn, signOut]);

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth(): AuthContextValue {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error("useAuth 必须在 <AuthProvider> 内使用");
  return ctx;
}
