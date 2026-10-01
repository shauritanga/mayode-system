// The apps now own their build directories; shared configuration lives here.
import type { NextConfig } from 'next';
import path from 'node:path';

export function portalConfig(mode: 'farmers' | 'cooperatives' | 'admin'): NextConfig {
  const root = path.resolve(__dirname, '..');
  return {
    turbopack: { root },
    outputFileTracingRoot: root,
    env: {
      NEXT_PUBLIC_APP_MODE: mode,
      NEXT_PUBLIC_SITE_URL: process.env.NEXT_PUBLIC_SITE_URL || `https://${mode}.mayodegroup.com`,
    },
  };
}
