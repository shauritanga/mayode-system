'use client';
import { useState } from 'react';
import { useRouter } from 'next/navigation';
import Image from 'next/image';
import { motion, useReducedMotion } from 'motion/react';
import { HugeiconsIcon } from '@hugeicons/react';
import { ViewIcon, ViewOffSlashIcon } from '@hugeicons/core-free-icons';
import { authApi } from '@/lib/api';
import { useAuthStore } from '@/store/auth.store';

export default function LoginPage() {
  const router = useRouter();
  const { setAuth } = useAuthStore();
  const reduce = useReducedMotion();
  const [phone, setPhone] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setLoading(true);
    try {
      const res = await authApi.login(phone, password);
      const { accessToken, refreshToken, user } = res.data;
      setAuth(user, accessToken, refreshToken);
      router.push('/dashboard');
    } catch (err: unknown) {
      const axiosErr = err as { response?: { data?: { message?: string } } };
      setError(axiosErr.response?.data?.message || 'Login failed. Please check your credentials.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <main className="auth-split">
      {/* Brand panel */}
      <motion.aside
        className="auth-brand"
        initial={reduce ? false : { opacity: 0 }}
        animate={{ opacity: 1 }}
        transition={{ duration: 0.5, ease: 'easeOut' }}
      >
        <Image
          src="/login-rice-field.png"
          alt="Rice paddies in Mbarali, Tanzania"
          fill
          priority
          sizes="(max-width: 900px) 100vw, 45vw"
          style={{ objectFit: 'cover', objectPosition: 'center' }}
        />
        <div className="auth-brand-scrim" />
        <div className="auth-brand-content">
          <div className="auth-brand-lockup">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src="/app-icon.png" alt="" className="auth-brand-icon" />
            <span className="auth-brand-name">MAYODE GROUP</span>
          </div>
          <div className="auth-brand-bottom">
            <p className="auth-brand-tagline">
              The integrated platform for AMCOS and Cooperatives in Tanzania.
            </p>
            <p className="auth-brand-sub">
              Traceability, Farmer records, crop cycles, Insurance, Credit and the M-LAX Marketplace all in one place.
            </p>
          </div>
        </div>
      </motion.aside>

      {/* Form panel */}
      <section className="auth-panel">
        <motion.div
          className="auth-form"
          initial={reduce ? false : { opacity: 0, y: 14 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.45, delay: 0.1, ease: [0.16, 1, 0.3, 1] }}
        >
          <div className="auth-form-lockup">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src="/app-icon.png" alt="" className="auth-form-icon" />
            <span className="auth-form-brand">MAYODE GROUP</span>
          </div>
          <h1 className="auth-title">Welcome back</h1>
          <p className="auth-subtitle">Sign in to your MAYODE GROUP workspace.</p>

          {error && (
            <div className="alert-box alert-danger" role="alert" style={{ marginBottom: '18px' }}>
              {error}
            </div>
          )}

          <form onSubmit={handleLogin} style={{ display: 'flex', flexDirection: 'column', gap: '14px' }}>
            <div>
              <label htmlFor="phone-input" style={{ display: 'block', fontSize: '13px', fontWeight: 600, color: 'var(--text-1)', marginBottom: '6px' }}>
                Phone Number
              </label>
              <input
                id="phone-input"
                type="tel"
                value={phone}
                onChange={e => setPhone(e.target.value)}
                placeholder="+255755123456"
                required
                autoComplete="tel"
                className="input-field"
              />
            </div>
            <div>
              <label htmlFor="password-input" style={{ display: 'block', fontSize: '13px', fontWeight: 600, color: 'var(--text-1)', marginBottom: '6px' }}>
                Password
              </label>
              <div style={{ position: 'relative' }}>
                <input
                  id="password-input"
                  type={showPassword ? 'text' : 'password'}
                  value={password}
                  onChange={e => setPassword(e.target.value)}
                  placeholder="••••••••"
                  required
                  autoComplete="current-password"
                  className="input-field"
                  style={{ paddingRight: '44px', width: '100%' }}
                />
                <button
                  type="button"
                  onClick={() => setShowPassword(v => !v)}
                  aria-label={showPassword ? 'Hide password' : 'Show password'}
                  style={{
                    position: 'absolute', top: '50%', right: '8px', transform: 'translateY(-50%)',
                    display: 'flex', alignItems: 'center', justifyContent: 'center',
                    width: 30, height: 30, borderRadius: 8,
                    background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text-3)', padding: 0,
                  }}
                >
                  <HugeiconsIcon icon={showPassword ? ViewOffSlashIcon : ViewIcon} size={17} strokeWidth={1.8} />
                </button>
              </div>
            </div>
            <button
              id="login-btn"
              type="submit"
              disabled={loading}
              className="btn-primary"
              style={{ marginTop: '6px', width: '100%', padding: '11px', fontSize: '14px', opacity: loading ? 0.7 : 1, cursor: loading ? 'not-allowed' : 'pointer' }}
            >
              {loading ? 'Signing in…' : 'Sign In'}
            </button>
          </form>

          <p style={{ fontSize: '12px', color: 'var(--text-3)', marginTop: '28px' }}>
            © {new Date().getFullYear()} MAYODE GROUP. All rights reserved.
          </p>
        </motion.div>
      </section>
    </main>
  );
}
