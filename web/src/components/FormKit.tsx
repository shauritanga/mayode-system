'use client';
import type { ReactNode } from 'react';

/**
 * Building blocks for modal forms, so every form follows the same rules (see the "Form kit" note in globals.css):
 * titled sections, one column unless the fields are short and related, label above / hint or error below,
 * optional fields marked as optional, and a choice between two ways of doing something shown as a pair of cards.
 */

/** The form itself: sections spaced 22px apart. Pass `id` so the footer's submit button can target it. */
export function Form({ id, onSubmit, children }: { id: string; onSubmit: () => void; children: ReactNode }) {
  return <form id={id} className="ua-form" noValidate autoComplete="off" onSubmit={(e) => { e.preventDefault(); onSubmit(); }}>{children}</form>;
}

/** A group of fields that belong together, with a small title and a divider above the next group. */
export function Section({ title, children }: { title?: string; children: ReactNode }) {
  return <section className="ua-section">{title && <div className="ua-section-title">{title}</div>}{children}</section>;
}

/** Two short, related fields side by side (stacks on a phone). */
export function Row({ children }: { children: ReactNode }) {
  return <div className="ua-row">{children}</div>;
}

/** Label above, hint or error below. A trailing " *" in the label is shown as a quiet required mark. */
export function Field({ label, optional, hint, error, children }: { label: string; optional?: boolean; hint?: string; error?: string; children: ReactNode }) {
  const required = / \*$/.test(label);
  return (
    <label className="ua-field">
      <span className="ua-label">{required ? label.replace(/ \*$/, '') : label}{required && <span className="fm-req" aria-hidden>*</span>}{optional && <span className="ua-opt">optional</span>}</span>
      {children}
      {error ? <span className="ua-hint" role="alert" style={{ color: 'var(--red-400)' }}>{error}</span> : hint ? <span className="ua-hint">{hint}</span> : null}
    </label>
  );
}

/** A message set apart from the fields: what will happen (info) or what is wrong (warn). */
export function Callout({ tone = 'info', children }: { tone?: 'info' | 'warn'; children: ReactNode }) {
  return <div className={`fm-callout${tone === 'warn' ? ' is-warn' : ''}`} role={tone === 'warn' ? 'alert' : 'status'}><span aria-hidden>{tone === 'warn' ? '⚠' : 'ℹ'}</span><div>{children}</div></div>;
}

/** Choose between two ways of doing something. Only the chosen way's fields should be shown below it. */
export function ChoiceCards<T extends string>({ value, onChange, options }: { value: T; onChange: (v: T) => void; options: { id: T; title: string; sub: string }[] }) {
  return (
    <div className="fm-choice" role="group">
      {options.map((o) => (
        <button key={o.id} type="button" className="fm-choice-card" aria-pressed={value === o.id} onClick={() => onChange(o.id)}>
          <span className="fm-choice-title">{o.title}</span><span className="fm-choice-sub">{o.sub}</span>
        </button>
      ))}
    </div>
  );
}

/** Optional extras, folded away so the form stays short. */
export function More({ title, children }: { title: string; children: ReactNode }) {
  return <details className="fm-more"><summary>{title}</summary><div style={{ display: 'grid', gap: 14, marginTop: 12 }}>{children}</div></details>;
}

/** The form-level error, at the bottom of the form, in the same place every time. */
export function FormError({ message }: { message?: string }) {
  return message ? <div className="ua-form-error" role="alert">{message}</div> : null;
}
