'use client';
/* eslint-disable @typescript-eslint/no-explicit-any -- API payloads are untyped JSON, as in the other dashboard screens */

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { irrigationApi } from '@/lib/api';
import { APP_MODE } from '@/lib/app-mode';
import { hasPermission } from '@/lib/nav';
import { LOGIN_ALERTS_FLAG, useAuthStore } from '@/store/auth.store';

/** A short two-note chime. Browsers may block audio until the page has been interacted with; then it plays on the first click. */
function playChime() {
  try {
    const Ctx = window.AudioContext ?? (window as any).webkitAudioContext;
    if (!Ctx) return;
    const ctx = new Ctx();
    const play = () => {
      const now = ctx.currentTime;
      [[880, 0], [660, 0.18]].forEach(([freq, offset]) => {
        const osc = ctx.createOscillator();
        const gain = ctx.createGain();
        osc.type = 'sine';
        osc.frequency.value = freq;
        gain.gain.setValueAtTime(0.0001, now + offset);
        gain.gain.exponentialRampToValueAtTime(0.18, now + offset + 0.02);
        gain.gain.exponentialRampToValueAtTime(0.0001, now + offset + 0.35);
        osc.connect(gain).connect(ctx.destination);
        osc.start(now + offset);
        osc.stop(now + offset + 0.4);
      });
    };
    if (ctx.state === 'suspended') {
      void ctx.resume().then(play).catch(() => {});
      if (ctx.state === 'suspended') {
        const retry = () => { void ctx.resume().then(play).catch(() => {}); };
        window.addEventListener('pointerdown', retry, { once: true });
        window.addEventListener('keydown', retry, { once: true });
      }
    } else play();
  } catch { /* no sound is fine */ }
}

/**
 * Shown once after each sign-in on the AMCOS portal: whatever needs attention in the irrigation scheme, in a closable box
 * at the bottom right with a soft sound. It does not come back on page changes or refreshes until the next sign-in.
 */
export default function LoginAlerts() {
  const user = useAuthStore((s) => s.user);
  const [alerts, setAlerts] = useState<{ severity: string; message: string; href: string }[]>([]);
  const [open, setOpen] = useState(false);
  const eligible = APP_MODE === 'cooperatives' && !!user?.mamcosId && hasPermission(user, 'irrigation', 'VIEW');

  useEffect(() => {
    if (!eligible || typeof window === 'undefined') return;
    if (sessionStorage.getItem(LOGIN_ALERTS_FLAG) !== 'pending') return;
    let live = true; // the flag is cleared only once this run's result is used, so a dev-mode double effect still shows it once
    (async () => {
      try {
        const schemes: any[] = (await irrigationApi.schemes()).data ?? [];
        const saved = localStorage.getItem('irrigation.schemeId');
        const scheme = schemes.find((s) => s.id === saved) ?? schemes[0];
        if (!scheme) { if (live) sessionStorage.removeItem(LOGIN_ALERTS_FLAG); return; }
        const list: any[] = (await irrigationApi.overview({ schemeId: scheme.id })).data?.alerts ?? [];
        if (!live) return;
        sessionStorage.removeItem(LOGIN_ALERTS_FLAG);
        if (!list.length) return;
        setAlerts([...list].sort((a, b) => (a.severity === b.severity ? 0 : a.severity === 'warning' ? -1 : 1)));
        setOpen(true);
        playChime();
      } catch { if (live) sessionStorage.removeItem(LOGIN_ALERTS_FLAG); /* the dashboard itself reports load errors */ }
    })();
    return () => { live = false; };
  }, [eligible]);

  if (!open || !alerts.length) return null;
  return (
    <aside className="login-alerts" role="status" aria-live="polite" aria-label="Alerts">
      <div className="login-alerts-head">
        <strong>Needs your attention</strong>
        <span className="badge badge-gold">{alerts.length}</span>
        <button type="button" className="login-alerts-close" onClick={() => setOpen(false)} aria-label="Close alerts">×</button>
      </div>
      <ul className="login-alerts-list">
        {alerts.slice(0, 5).map((a, i) => (
          <li key={i}><Link href={a.href} onClick={() => setOpen(false)}>{a.message}</Link></li>
        ))}
      </ul>
      {alerts.length > 5 && <div className="login-alerts-more">and {alerts.length - 5} more</div>}
    </aside>
  );
}
