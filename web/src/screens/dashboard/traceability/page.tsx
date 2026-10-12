'use client';
import { TableSkeleton } from '@/components/role-dashboards/DashboardPrimitives';

import { Suspense } from 'react';
import TraceabilityClient from './TraceabilityClient';

export default function TraceabilityPage() {
  return (
    <Suspense
      fallback={
        <div className="page-shell">
          <TableSkeleton rows={4} avatar={false} />
        </div>
      }
    >
      <TraceabilityClient />
    </Suspense>
  );
}
