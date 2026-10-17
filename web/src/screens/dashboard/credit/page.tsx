'use client';
import { useState } from 'react';
import { motion } from 'motion/react';
import { useAuthStore } from '@/store/auth.store';
import { hasPermission } from '@/lib/nav';
import ApplicationsPanel from '@/components/credit/ApplicationsPanel';
import LoansPortfolio from '@/components/credit/LoansPortfolio';

export default function CreditPage() {
  const user = useAuthStore((s) => s.user);
  const canApply = hasPermission(user, 'loans', 'CREATE');
  const [tab, setTab] = useState<'applications' | 'loans'>('applications');
  return (
    <div className="page-shell">
      <div className="page-heading">
        <div>
          <div className="page-kicker">Finance and Credit</div>
          <h1 className="page-title">Credit &amp; Loans</h1>
          <p className="page-subtitle">Loan applications for your farmers, the lender’s decision, disbursement, repayment schedules and balances.</p>
        </div>
      </div>
      <div className="seg-control" style={{ marginBottom: 16 }} role="tablist">
        {([['applications', 'Loan applications'], ['loans', 'Loans and repayments']] as const).map(([id, label]) => (
          <button key={id} role="tab" aria-selected={tab === id} className={`seg-btn ${tab === id ? 'active' : ''}`} onClick={() => setTab(id)}>
            {tab === id && <motion.span layoutId="credit-pill" className="seg-pill" transition={{ type: 'spring', bounce: 0.18, duration: 0.45 }} />}
            {label}
          </button>
        ))}
      </div>
      {tab === 'applications' ? <ApplicationsPanel mode="applicant" canApply={canApply} /> : <LoansPortfolio />}
    </div>
  );
}
