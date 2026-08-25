'use client';
import Sidebar from '@/components/Sidebar';
import Header from '@/components/Header';
import PageTransition from '@/components/PageTransition';
import { useAuthStore } from '@/store/auth.store';
import { useUiStore } from '@/store/ui.store';
import { useRouter } from 'next/navigation';
import { useEffect } from 'react';
import { useIdleLogout } from '@/hooks/useIdleLogout';

export default function DashboardLayout({ children }: { children: React.ReactNode }) {
  const { isAuthenticated, _hasHydrated } = useAuthStore();
  const sidebarCollapsed = useUiStore((s) => s.sidebarCollapsed);
  const router = useRouter();

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

  if (!_hasHydrated || !isAuthenticated) return null;

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
