'use client';
import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { Eye, EyeOff } from 'lucide-react';
import { authApi } from '@/lib/api';
import { useAuthStore } from '@/store/auth.store';

export default function LoginPage() {
  const router = useRouter();
  const { setAuth } = useAuthStore();
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
      const { accessToken, user } = res.data;
      setAuth(user, accessToken);
      router.push('/dashboard');
    } catch (err: unknown) {
      const axiosErr = err as { response?: { data?: { message?: string } } };
      setError(axiosErr.response?.data?.message || 'Login failed. Please check your credentials.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <main
      style={{
        minHeight: '100vh',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        background: 'radial-gradient(ellipse at 30% 20%, rgba(6, 78, 59, 0.25) 0%, #0A0A0A 60%), radial-gradient(ellipse at 70% 80%, rgba(180, 83, 9, 0.15) 0%, transparent 50%)',
        padding: '24px',
      }}
    >
      {/* Decorative orbs */}
      <div style={{ position: 'fixed', top: '-160px', left: '-160px', width: '480px', height: '480px', borderRadius: '50%', background: 'radial-gradient(circle, rgba(16, 185, 129, 0.08) 0%, transparent 70%)', pointerEvents: 'none' }} />
      <div style={{ position: 'fixed', bottom: '-160px', right: '-160px', width: '480px', height: '480px', borderRadius: '50%', background: 'radial-gradient(circle, rgba(245, 158, 11, 0.06) 0%, transparent 70%)', pointerEvents: 'none' }} />

      <div className="animate-fade-in" style={{ width: '100%', maxWidth: '420px' }}>
        {/* Logo */}
        <div style={{ textAlign: 'center', marginBottom: '40px' }}>
          <div style={{
            display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
            width: '72px', height: '72px', borderRadius: '20px',
            background: 'linear-gradient(135deg, #065F46, #10B981)',
            boxShadow: '0 8px 32px rgba(16, 185, 129, 0.3)',
            marginBottom: '16px',
          }}>
            <span style={{ fontSize: '28px', fontWeight: 800, color: 'white', fontFamily: 'Outfit, sans-serif' }}>M</span>
          </div>
          <h1 style={{ fontFamily: 'Outfit, sans-serif', fontSize: '28px', fontWeight: 800, color: '#F9FAFB', marginBottom: '6px' }}>
            MAYODE GROUP
          </h1>
          <p style={{ fontSize: '14px', color: '#6B7280' }}>MAYOData Platform — Administrator Portal</p>
        </div>

        {/* Card */}
        <div className="glass-card" style={{ padding: '36px' }}>
          <h2 style={{ fontSize: '18px', fontWeight: 700, color: '#F9FAFB', marginBottom: '6px' }}>Sign in to your account</h2>
          <p style={{ fontSize: '13px', color: '#6B7280', marginBottom: '28px' }}>Enter your registered phone number and password</p>

          {error && (
            <div style={{ background: 'rgba(239, 68, 68, 0.12)', border: '1px solid rgba(239, 68, 68, 0.3)', borderRadius: '10px', padding: '12px 14px', marginBottom: '20px', fontSize: '13px', color: '#F87171' }}>
              {error}
            </div>
          )}

          <form onSubmit={handleLogin} style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
            <div>
              <label style={{ display: 'block', fontSize: '13px', fontWeight: 500, color: '#D1D5DB', marginBottom: '6px' }}>
                Phone Number
              </label>
              <input
                id="phone-input"
                type="tel"
                value={phone}
                onChange={e => setPhone(e.target.value)}
                placeholder="+255755123456"
                required
                className="input-field"
              />
            </div>
            <div>
              <label style={{ display: 'block', fontSize: '13px', fontWeight: 500, color: '#D1D5DB', marginBottom: '6px' }}>
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
                  className="input-field"
                  style={{ paddingRight: '44px', width: '100%' }}
                />
                <button
                  type="button"
                  onClick={() => setShowPassword(v => !v)}
                  aria-label={showPassword ? 'Hide password' : 'Show password'}
                  style={{
                    position: 'absolute', top: '50%', right: '12px', transform: 'translateY(-50%)',
                    display: 'flex', alignItems: 'center', justifyContent: 'center',
                    background: 'none', border: 'none', cursor: 'pointer', color: '#6B7280', padding: '4px',
                  }}
                >
                  {showPassword ? <EyeOff size={18} /> : <Eye size={18} />}
                </button>
              </div>
            </div>
            <button
              id="login-btn"
              type="submit"
              disabled={loading}
              className="btn-primary"
              style={{ marginTop: '8px', width: '100%', padding: '12px', fontSize: '15px', opacity: loading ? 0.7 : 1 }}
            >
              {loading ? 'Signing in…' : 'Sign In'}
            </button>
          </form>
        </div>

        <p style={{ textAlign: 'center', fontSize: '12px', color: '#4B5563', marginTop: '24px' }}>
          © {new Date().getFullYear()} MAYODE GROUP. All rights reserved.
        </p>
      </div>
    </main>
  );
}
