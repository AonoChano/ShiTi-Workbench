import { useEffect, useRef, type ComponentType } from "react";
import { Player, type PlayerRef } from "@remotion/player";
import { cn } from "../utils/cn";
import { useReducedMotion } from "../lib/useReducedMotion";
import type { MotionSpec } from "../remotion/theme";

type MotionPlayerProps = {
  component: ComponentType<Record<string, never>>;
  spec: MotionSpec;
  /** 给读屏软件的说明；动画本身是装饰性的 */
  label: string;
  className?: string;
};

/**
 * Remotion <Player> 的页面封装：
 * - 不显示控制条、不响应点击 / 空格 / 双击全屏、没有音频标签；
 * - 只在进入视口时播放，离开视口暂停（省电，也避免多个播放器同时抢主线程）；
 * - prefers-reduced-motion 下不播放，停在 spec.posterFrame。
 */
export function MotionPlayer({ component, spec, label, className }: MotionPlayerProps) {
  const reduced = useReducedMotion();
  const playerRef = useRef<PlayerRef>(null);
  const boxRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const el = boxRef.current;
    const player = playerRef.current;
    if (!el || !player) return;

    if (reduced) {
      player.pause();
      player.seekTo(spec.posterFrame);
      return;
    }
    if (typeof IntersectionObserver === "undefined") {
      player.play();
      return;
    }

    const observer = new IntersectionObserver(
      ([entry]) => {
        const current = playerRef.current;
        if (!current) return;
        if (entry.isIntersecting) {
          if (!current.isPlaying()) current.play();
        } else if (current.isPlaying()) {
          current.pause();
        }
      },
      { threshold: 0.15 },
    );
    observer.observe(el);
    return () => observer.disconnect();
  }, [reduced, spec.posterFrame]);

  return (
    <div ref={boxRef} className={cn("relative overflow-hidden bg-paper", className)} role="img" aria-label={label}>
      <Player
        ref={playerRef}
        component={component}
        inputProps={{}}
        durationInFrames={spec.durationInFrames}
        compositionWidth={spec.width}
        compositionHeight={spec.height}
        fps={spec.fps}
        style={{ width: "100%" }}
        loop={!reduced}
        autoPlay={false}
        initialFrame={reduced ? spec.posterFrame : 0}
        controls={false}
        clickToPlay={false}
        doubleClickToFullscreen={false}
        spaceKeyToPlayOrPause={false}
        allowFullscreen={false}
        showVolumeControls={false}
        initiallyMuted
        numberOfSharedAudioTags={0}
        acknowledgeRemotionLicense
        errorFallback={() => (
          <div className="flex h-full w-full items-center justify-center bg-material text-[11px] text-muted">动画暂时无法显示</div>
        )}
      />
    </div>
  );
}
