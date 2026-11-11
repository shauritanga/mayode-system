'use client';
import { useEffect, useRef, useState, type ReactNode } from 'react';

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
 *
 * Once anything inside has been typed or changed, Escape or a click outside no longer throws it away: it asks
 * "Close without saving?" first. The ✕ / Cancel buttons (which call `onClose` themselves) still close at once.
 */
export default function Modal({ title, subtitle, onClose, footer, children, width = '480px' }: ModalProps) {
  const cardRef = useRef<HTMLDivElement>(null);
  const edited = useRef(false);
  const [asking, setAsking] = useState(false);

  // A stray click or key press must not lose what was typed: ask first, but only after something was changed.
  const dismiss = () => {
    if (edited.current) setAsking(true);
    else onClose();
  };

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== 'Escape') return;
      if (asking) setAsking(false);
      else if (edited.current) setAsking(true);
      else onClose();
    };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [asking, onClose]);

  return (
    <div
      style={{
        position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.6)', zIndex: 100,
        display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '20px',
      }}
      onMouseDown={(e) => {
        if (e.target === e.currentTarget) dismiss();
      }}
    >
      <div
        ref={cardRef}
        onInputCapture={() => { edited.current = true; }}
        onChangeCapture={() => { edited.current = true; }}
        role="dialog"
        aria-modal="true"
        aria-label={title}
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
      {asking && (
        <div
          style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.5)', zIndex: 200, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '20px' }}
          onMouseDown={(e) => { e.stopPropagation(); if (e.target === e.currentTarget) setAsking(false); }}
        >
          <div role="alertdialog" aria-modal="true" aria-label="Close without saving?" className="glass-card" style={{ width: 'min(400px, 100%)', overflow: 'hidden' }}>
            <div style={{ padding: '18px 22px', borderBottom: '1px solid var(--border)' }}>
              <h2 style={{ fontFamily: 'Outfit, sans-serif', fontSize: '17px', fontWeight: 800, color: 'var(--text-primary)', margin: 0 }}>Close without saving?</h2>
            </div>
            <div style={{ padding: '16px 22px' }}>
              <p style={{ margin: 0, fontSize: 14, lineHeight: 1.6, color: 'var(--neutral-500)' }}>What you have entered will be lost. Do you want to keep editing?</p>
            </div>
            <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end', padding: '14px 22px', borderTop: '1px solid var(--border)' }}>
              <button type="button" className="btn-secondary" onClick={onClose}>Discard</button>
              <button type="button" className="btn-primary" autoFocus onClick={() => setAsking(false)}>Keep editing</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
