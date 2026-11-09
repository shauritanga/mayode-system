'use client';
import { useEffect, useRef } from 'react';
import { useRouter } from 'next/navigation';
import { useAuthStore } from '@/store/auth.store';

const ACTIVITY_EVENTS = ['mousedown', 'mousemove', 'keydown', 'scroll', 'touchstart', 'click'] as const;
const STAMP = 'mayode-last-activity';
const stamp = () => { try { return Number(localStorage.getItem(STAMP)) || 0; } catch { return 0; } };
const touch = () => { try { localStorage.setItem(STAMP, String(Date.now())); } catch { /* storage unavailable */ } };

/** Minutes of inactivity before sign-out. Set NEXT_PUBLIC_IDLE_MINUTES at build time to change it. */
export const IDLE_MINUTES = Math.max(1, Number(process.env.NEXT_PUBLIC_IDLE_MINUTES) || 15);

/**
 * Signs the user out after `timeoutMs` of no mouse/keyboard/touch activity, even though their access token keeps being
 * silently refreshed. The last activity time is kept in storage, so a tab that was asleep, or a browser that was closed
 * and reopened later, signs out as soon as it is back instead of resuming the old session. The server also ends a session
 * that has been idle too long (its refresh token lapses), so this is not the only line of defence.
 */
export function useIdleLogout(timeoutMs: number = IDLE_MINUTES * 60 * 1000) {
  const router = useRouter();
  const clearAuth = useAuthStore((s) => s.clearAuth);
  const isAuthenticated = useAuthStore((s) => s.isAuthenticated);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    if (!isAuthenticated) return;

    const logout = () => {
      clearAuth();
      router.push('/login?reason=idle');
    };
    const expired = () => { const last = stamp(); return last > 0 && Date.now() - last > timeoutMs; };

    // Coming back after a long absence (closed browser, sleeping laptop): sign out at once.
    if (expired()) { logout(); return; }

    let lastWrite = 0;
    const resetTimer = () => {
      const now = Date.now();
      if (now - lastWrite > 5000) { touch(); lastWrite = now; }
      if (timerRef.current) clearTimeout(timerRef.current);
      timerRef.current = setTimeout(logout, timeoutMs);
    };
    const onVisible = () => {
      if (document.visibilityState !== 'visible') return;
      if (expired()) logout(); else resetTimer();
    };

    resetTimer();
    ACTIVITY_EVENTS.forEach((event) => window.addEventListener(event, resetTimer, { passive: true }));
    document.addEventListener('visibilitychange', onVisible);

    return () => {
      if (timerRef.current) clearTimeout(timerRef.current);
      ACTIVITY_EVENTS.forEach((event) => window.removeEventListener(event, resetTimer));
      document.removeEventListener('visibilitychange', onVisible);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isAuthenticated, timeoutMs]);
}
