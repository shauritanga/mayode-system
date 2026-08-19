'use client';

import { Suspense } from 'react';
import TraceabilityClient from './TraceabilityClient';

export default function TraceabilityPage() {
  return (
    <Suspense
      fallback={
        <div className="page-shell">
          <p className="muted">Loading traceability…</p>
        </div>
      }
    >
      <TraceabilityClient />
    </Suspense>
  );
}
