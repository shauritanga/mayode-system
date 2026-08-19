'use client';
import { motion, useReducedMotion } from 'motion/react';
import { usePathname } from 'next/navigation';
import type { ReactNode } from 'react';

/**
 * Subtle cross-route transition: each page fades/rises in on navigation.
 * No exit animation — waiting for the old page to unmount would delay
 * rendering of the new one, which feels sluggish in a work tool.
 */
export default function PageTransition({ children }: { children: ReactNode }) {
  const pathname = usePathname();
  const reduce = useReducedMotion();

  return (
    <motion.div
      key={pathname}
      initial={reduce ? false : { opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.28, ease: [0.16, 1, 0.3, 1] }}
      style={{ minHeight: '100%' }}
    >
      {children}
    </motion.div>
  );
}
