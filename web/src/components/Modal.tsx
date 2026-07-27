'use client';
import { useEffect, useRef, type ReactNode } from 'react';

interface ModalProps {
  title: string;
  subtitle?: string;
  onClose: () => void;
  footer: ReactNode;
  children: ReactNode;
  width?: string;
}

/**
 * Standard modal shell: fixed header (title/subtitle) and fixed footer
 * (action buttons) with only the body scrolling when content is taller than
 * the viewport allows. Closes on Escape or a click outside the card.
 */
export default function Modal({ title, subtitle, onClose, footer, children, width = '480px' }: ModalProps) {
  const cardRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [onClose]);

  return (
    <div
      style={{
        position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.6)', zIndex: 100,
        display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '20px',
      }}
      onMouseDown={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div
        ref={cardRef}
        className="glass-card"
        style={{
          width,
          maxWidth: '100%',
          maxHeight: 'calc(100vh - 40px)',
          display: 'flex',
          flexDirection: 'column',
          overflow: 'hidden',
        }}
      >
        <div style={{ padding: '20px 24px', borderBottom: '1px solid var(--border)', flexShrink: 0 }}>
          <h2 style={{ fontFamily: 'Outfit, sans-serif', fontSize: '18px', fontWeight: 800, color: 'var(--text-primary)' }}>
            {title}
          </h2>
          {!!subtitle && (
            <p style={{ fontSize: '13px', color: 'var(--neutral-500)', marginTop: '4px' }}>{subtitle}</p>
          )}
        </div>

        <div style={{ padding: '20px 24px', overflowY: 'auto', flex: 1 }}>
          {children}
        </div>

        <div
          style={{
            display: 'flex', gap: '8px', justifyContent: 'flex-end',
            padding: '16px 24px', borderTop: '1px solid var(--border)', flexShrink: 0,
          }}
        >
          {footer}
        </div>
      </div>
    </div>
  );
}
