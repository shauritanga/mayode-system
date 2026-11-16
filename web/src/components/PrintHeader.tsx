'use client';
import { useEffect, useState } from 'react';
import { useAuthStore } from '@/store/auth.store';

/** Shown only on paper: what is printed, when and by whom, above the page. */
export default function PrintHeader() {
  const user = useAuthStore((s) => s.user);
  const [title, setTitle] = useState('');
  const [when, setWhen] = useState('');
  useEffect(() => {
    const before = () => {
      setTitle(document.querySelector('.header-title')?.textContent ?? document.title);
      setWhen(new Date().toLocaleString('en-GB', { dateStyle: 'long', timeStyle: 'short' }));
    };
    window.addEventListener('beforeprint', before);
    return () => window.removeEventListener('beforeprint', before);
  }, []);
  return (
    <div className="print-only print-header">
      <h1>{title}</h1>
      <p>Printed {when}{user?.firstName ? ` by ${[user.firstName, user.lastName].filter(Boolean).join(' ')}` : ''}</p>
    </div>
  );
}
