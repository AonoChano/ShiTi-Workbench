import { useEffect, useState } from "react";
import { SITE } from "../config/site";

/**
 * GitHub Star 数 —— 主页唯一的外部网络请求。
 *
 * 防护点
 * - 来源白名单：只允许 GitHub 公开 API，或 VITE_GITHUB_STARS_ENDPOINT 指定的 https 代理；可设为 off 完全关闭。
 * - 请求不带凭据（credentials: omit）、不带 referrer、6 秒超时、不缓存到 HTTP 缓存。
 * - 响应校验：状态码、最终 URL 的 origin（防止被重定向到别处）、Content-Type、字段类型与范围。
 * - 页面只渲染一个经过校验的非负整数，不会把任何接口返回的字符串写进 DOM。
 * - sessionStorage 缓存 10 分钟，读取时同样做类型与时效校验（不信任存储内容）。
 */

const CACHE_KEY = "shiti:gh-stars:v1";
const CACHE_TTL = 10 * 60 * 1000;
const TIMEOUT_MS = 6000;
const MAX_STARS = 1_000_000_000;
const GITHUB_API = "https://api.github.com";

export type StarsState = "loading" | "unavailable" | number;

function resolveEndpoint(): string | null {
  const raw = import.meta.env.VITE_GITHUB_STARS_ENDPOINT?.trim();
  if (raw === "off") return null;
  if (raw) {
    try {
      const url = new URL(raw);
      if (url.protocol === "https:") return url.href;
    } catch {
      /* 非法配置，回退到 GitHub API */
    }
  }
  return `${GITHUB_API}/repos/${encodeURIComponent(SITE.repo.owner)}/${encodeURIComponent(SITE.repo.name)}`;
}

function toSafeCount(value: unknown): number | null {
  if (typeof value !== "number" || !Number.isFinite(value)) return null;
  if (value < 0 || value > MAX_STARS) return null;
  return Math.floor(value);
}

/** 兼容 GitHub API（stargazers_count）与自建代理（stars） */
function pickStars(data: unknown): number | null {
  if (!data || typeof data !== "object") return null;
  const record = data as Record<string, unknown>;
  return toSafeCount(record.stargazers_count) ?? toSafeCount(record.stars);
}

function readCache(): number | null {
  try {
    const raw = sessionStorage.getItem(CACHE_KEY);
    if (!raw) return null;
    const parsed: unknown = JSON.parse(raw);
    if (!parsed || typeof parsed !== "object") return null;
    const { stars, fetchedAt } = parsed as Record<string, unknown>;
    const count = toSafeCount(stars);
    if (count === null || typeof fetchedAt !== "number") return null;
    if (Date.now() - fetchedAt > CACHE_TTL) return null;
    return count;
  } catch {
    return null;
  }
}

function writeCache(stars: number) {
  try {
    sessionStorage.setItem(CACHE_KEY, JSON.stringify({ stars, fetchedAt: Date.now() }));
  } catch {
    /* 隐私模式等情况下存储不可用，忽略 */
  }
}

let inflight: Promise<number | null> | null = null;

/** 多个组件同时需要 Star 数时只发一次请求（页面上有徽标和开源卡两处）。 */
export function fetchStars(): Promise<number | null> {
  const cached = readCache();
  if (cached !== null) return Promise.resolve(cached);
  if (!inflight) {
    inflight = requestStars().finally(() => {
      inflight = null;
    });
  }
  return inflight;
}

async function requestStars(): Promise<number | null> {
  const endpoint = resolveEndpoint();
  if (!endpoint) return null;

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);

  try {
    const response = await fetch(endpoint, {
      method: "GET",
      mode: "cors",
      credentials: "omit",
      cache: "no-store",
      referrerPolicy: "no-referrer",
      headers: { Accept: "application/vnd.github+json" },
      signal: controller.signal,
    });
    if (!response.ok) return null;

    // 最终响应必须仍来自我们允许的 origin
    if (response.url && new URL(response.url).origin !== new URL(endpoint).origin) return null;

    const contentType = response.headers.get("content-type") ?? "";
    if (!contentType.includes("json")) return null;

    const data: unknown = await response.json();
    const stars = pickStars(data);
    if (stars === null) return null;

    writeCache(stars);
    return stars;
  } catch {
    return null;
  } finally {
    clearTimeout(timer);
  }
}

export function formatStars(count: number): string {
  if (count < 1000) return String(count);
  const k = count / 1000;
  const text = k >= 10 ? k.toFixed(0) : k.toFixed(1).replace(/\.0$/, "");
  return `${text}k`;
}

export function useGitHubStars(): StarsState {
  const [state, setState] = useState<StarsState>("loading");

  useEffect(() => {
    let cancelled = false;
    fetchStars().then((stars) => {
      if (cancelled) return;
      setState(stars === null ? "unavailable" : stars);
    });
    return () => {
      cancelled = true;
    };
  }, []);

  return state;
}
