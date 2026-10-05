import { BrandMark } from "../components/auth/BrandMark";

/** 启动时确认会话期间的极简等待页（避免已登录用户先看到一闪而过的登录页） */
export default function SessionSplash() {
  return (
    <div className="relative grid min-h-screen place-items-center">
      <div aria-hidden="true" className="ruled-bg pointer-events-none fixed inset-0" />
      <div role="status" aria-live="polite" className="reveal relative flex flex-col items-center gap-5">
        <BrandMark />
        <div className="meta-row text-meta text-muted">
          <span>正在确认登录状态</span>
        </div>
        <div className="h-[2px] w-24 overflow-hidden rounded-full bg-wash" aria-hidden="true">
          <div className="h-full w-1/3 animate-[auth-splash_1.1s_ease-in-out_infinite] rounded-full bg-fill-soft" />
        </div>
      </div>
    </div>
  );
}
