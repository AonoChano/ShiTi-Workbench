import { useEffect, useRef, useState, type CSSProperties, type ElementType, type ReactNode } from "react";
import { cn } from "../utils/cn";
import { useReducedMotion } from "../lib/useReducedMotion";

/**
 * 入场动效：opacity + 8px translateY，按 index 错峰 70ms。
 * 共用一个 IntersectionObserver，元素进入视口后只触发一次。
 */

let sharedObserver: IntersectionObserver | null = null;
const callbacks = new WeakMap<Element, () => void>();

function getObserver() {
  if (sharedObserver) return sharedObserver;
  sharedObserver = new IntersectionObserver(
    (entries) => {
      for (const entry of entries) {
        if (!entry.isIntersecting) continue;
        callbacks.get(entry.target)?.();
        sharedObserver?.unobserve(entry.target);
        callbacks.delete(entry.target);
      }
    },
    { rootMargin: "0px 0px -6% 0px", threshold: 0.06 },
  );
  return sharedObserver;
}

type RevealProps = {
  as?: ElementType;
  index?: number;
  className?: string;
  id?: string;
  children?: ReactNode;
  style?: CSSProperties;
};

export function Reveal({ as = "div", index = 0, className, id, children, style }: RevealProps) {
  const Tag = as as "div";
  const ref = useRef<HTMLDivElement>(null);
  const reduced = useReducedMotion();
  const [shown, setShown] = useState(false);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    if (reduced || typeof IntersectionObserver === "undefined") {
      setShown(true);
      return;
    }
    const observer = getObserver();
    callbacks.set(el, () => setShown(true));
    observer.observe(el);
    return () => {
      observer.unobserve(el);
      callbacks.delete(el);
    };
  }, [reduced]);

  return (
    <Tag
      ref={ref}
      id={id}
      className={cn("reveal", shown && "is-in", className)}
      style={{ ...style, "--i": index } as CSSProperties}
    >
      {children}
    </Tag>
  );
}
