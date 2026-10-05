import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from 'react';
import { api } from './api';
import type { ExamType } from './model';

/** 个人资料 = 账号信息（服务端 users 表）+ 学习偏好（users.preferences_json） */
export interface Profile {
  nickname: string;
  username: string;
  email: string;
  role: string;
  exam: ExamType;
  dailyTarget: number;
  targetDate: string;
}

const FALLBACK: Profile = { nickname: '拾题同学', username: '', email: '', role: 'user', exam: '英语一', dailyTarget: 20, targetDate: '' };

interface ProfileContextValue {
  profile: Profile;
  /** 加载中：界面先用缺省值渲染，避免闪空 */
  loading: boolean;
  /** 保存昵称与学习偏好（PUT /profile，局部更新） */
  save: (patch: Partial<Pick<Profile, 'nickname' | 'exam' | 'dailyTarget' | 'targetDate'>>) => Promise<void>;
}

const ProfileContext = createContext<ProfileContextValue>({ profile: FALLBACK, loading: true, save: async () => {} });

export function ProfileProvider({ children }: { children: ReactNode }) {
  const [profile, setProfile] = useState<Profile>(FALLBACK);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let alive = true;
    api<Record<string, unknown>>('GET', '/profile')
      .then((p) => {
        if (!alive) return;
        setProfile({
          nickname: String(p['nickname'] ?? FALLBACK.nickname),
          username: String(p['username'] ?? ''),
          email: String(p['email'] ?? ''),
          role: String(p['role'] ?? 'user'),
          exam: (p['exam'] as ExamType) ?? '英语一',
          dailyTarget: Number(p['daily_target'] ?? 20),
          targetDate: String(p['target_date'] ?? ''),
        });
      })
      .catch(() => {})
      .finally(() => { if (alive) setLoading(false); });
    return () => { alive = false; };
  }, []);

  const save = useCallback<ProfileContextValue['save']>(async (patch) => {
    const body: Record<string, unknown> = {};
    if (patch.nickname !== undefined) body['nickname'] = patch.nickname;
    if (patch.exam !== undefined) body['exam'] = patch.exam;
    if (patch.dailyTarget !== undefined) body['daily_target'] = patch.dailyTarget;
    if (patch.targetDate !== undefined) body['target_date'] = patch.targetDate;
    await api('PUT', '/profile', body);
    setProfile((prev) => ({ ...prev, ...patch }));
  }, []);

  const value = useMemo(() => ({ profile, loading, save }), [profile, loading, save]);
  return <ProfileContext.Provider value={value}>{children}</ProfileContext.Provider>;
}

export function useProfile(): ProfileContextValue {
  return useContext(ProfileContext);
}
