'use client';
import Sidebar from '@/components/Sidebar';
import Header from '@/components/Header';
import PageTransition from '@/components/PageTransition';
import { useAuthStore } from '@/store/auth.store';
import { useUiStore } from '@/store/ui.store';
import { useRouter, usePathname } from 'next/navigation';
import { useEffect } from 'react';
import { useIdleLogout } from '@/hooks/useIdleLogout';
import { authApi } from '@/lib/api';
import { isPathAllowed } from '@/lib/nav';

export default function DashboardLayout({ children }: { children: React.ReactNode }) {
  const { user, isAuthenticated, _hasHydrated, updateUser } = useAuthStore();
  const sidebarCollapsed = useUiStore((s) => s.sidebarCollapsed);
  const router = useRouter();
  const pathname = usePathname();

  useIdleLogout();

  useEffect(() => {
    // Wait for the persisted auth state to load from localStorage before
    // deciding to redirect — otherwise every full page reload briefly sees
    // the default (logged-out) state and bounces the user to /login.
    if (!_hasHydrated) return;
    if (!isAuthenticated) {
      router.push('/login');
    }
  }, [isAuthenticated, _hasHydrated, router]);

  // Refresh the session profile once per mount so persisted (possibly stale)
  // role/permission snapshots — e.g. sessions stored before permissions
  // existed — converge with the server. Failures fall through to the
  // existing 401 interceptor, which logs out on invalid tokens.
  useEffect(() => {
    if (!_hasHydrated || !isAuthenticated) return;
    authApi
      .me()
      .then((res) => {
        if (res.data) updateUser(res.data);
      })
      .catch(() => {});
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [_hasHydrated, isAuthenticated]);

  // Route guard: sidebar hiding is cosmetic — direct-URL navigation to a
  // section outside the caller's role (or custom-role grants) lands here
  // and is bounced to a 403 page instead of rendering then failing at the API.
  useEffect(() => {
    if (!_hasHydrated || !isAuthenticated || !user) return;
    if (!isPathAllowed(pathname, user)) {
      router.replace('/dashboard/forbidden');
    }
  }, [_hasHydrated, isAuthenticated, user, pathname, router]);

  if (!_hasHydrated || !isAuthenticated) return null;
  if (user && !isPathAllowed(pathname, user)) return null;

  return (
    <div className={`shell ${sidebarCollapsed ? 'sidebar-collapsed' : ''}`}>
      <Sidebar />
      <div className="shell-main">
        <Header />
        <main className="shell-content">
          <PageTransition>{children}</PageTransition>
        </main>
      </div>
    </div>
  );
}
