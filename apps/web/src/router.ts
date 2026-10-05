import { useEffect, useState } from 'react';

/** 轻量 history 路由（M1 不引入 react-router）。 */
export function usePath(): string {
  const [path, setPath] = useState(window.location.pathname);
  useEffect(() => {
    const onPop = () => setPath(window.location.pathname);
    window.addEventListener('popstate', onPop);
    return () => window.removeEventListener('popstate', onPop);
  }, []);
  return path;
}

export function navigate(to: string): void {
  window.history.pushState(null, '', to);
  window.dispatchEvent(new PopStateEvent('popstate'));
}

/** 重定向（替换当前历史记录，不留回退痕迹）：用于登录态变化时的落地修正 */
export function redirect(to: string): void {
  window.history.replaceState(null, '', to);
  window.dispatchEvent(new PopStateEvent('popstate'));
}
