import { createContext, useCallback, useContext, useEffect, useState } from 'react';
import type { ReactNode } from 'react';
import { CheckCircle2 } from 'lucide-react';

interface ToastCtx { notify: (text: string) => void }
const Ctx = createContext<ToastCtx>({ notify: () => {} });

export function useToast() { return useContext(Ctx); }

export function ToastProvider({ children }: { children: ReactNode }) {
  const [toast, setToast] = useState<{ text: string; id: number } | null>(null);
  const notify = useCallback((text: string) => setToast({ text, id: Date.now() }), []);
  useEffect(() => {
    if (!toast) return;
    const t = window.setTimeout(() => setToast(null), 3200);
    return () => window.clearTimeout(t);
  }, [toast]);
  return (
    <Ctx.Provider value={{ notify }}>
      {children}
      {toast && <div className="toast" role="status" key={toast.id}><CheckCircle2 size={18} /><span>{toast.text}</span></div>}
    </Ctx.Provider>
  );
}
