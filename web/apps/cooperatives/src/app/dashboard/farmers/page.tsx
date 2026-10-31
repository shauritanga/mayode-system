'use client';

import { useEffect } from 'react';
import { useRouter } from 'next/navigation';
import FarmersPage from '@/screens/dashboard/farmers/page';
import { isPathAllowed } from '@/lib/nav';
import { useAuthStore } from '@/store/auth.store';

/** The farmer list lives inside Farmers & Plot Allocation for anyone who can open it; everyone else keeps this page. */
export default function CooperativeFarmers() {
  const router = useRouter();
  const user = useAuthStore((s) => s.user);
  const merged = !!user && isPathAllowed('/dashboard/plot-allocation', user);
  useEffect(() => { if (merged) router.replace('/dashboard/plot-allocation'); }, [merged, router]);
  return merged ? null : <FarmersPage />;
}
