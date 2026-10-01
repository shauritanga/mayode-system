'use client';
import { useEffect } from 'react';
import { useRouter } from 'next/navigation';

// This page's content moved to /dashboard directly (it was a redundant duplicate
// of the main admin landing page). Kept as a redirect so old links/bookmarks
// still land somewhere useful instead of 404ing.
export default function MayodataAdminRedirect() {
  const router = useRouter();
  useEffect(() => {
    router.replace('/dashboard');
  }, [router]);
  return null;
}
