'use client';
import { useState } from 'react';
import ApplicationsPanel from '@/components/credit/ApplicationsPanel';
import LoansPortfolio from '@/components/credit/LoansPortfolio';
import CreditProfileView from '@/components/credit/CreditProfileView';
import { farmersApi } from '@/lib/api';
import { useEffect } from 'react';

export default function FarmerLoansPage() {
  const [farmerId, setFarmerId] = useState('');
  const [showProfile, setShowProfile] = useState(false);
  useEffect(() => { farmersApi.getMe().then((r) => setFarmerId(r.data?.id ?? '')).catch(() => undefined); }, []);
  return (
    <div className="page-shell">
      <div className="page-heading">
        <div>
          <div className="page-kicker">Finance</div>
          <h1 className="page-title">My loans</h1>
          <p className="page-subtitle">Apply to a lender, follow your application, and see what you owe and when it is due.</p>
        </div>
      </div>
      <ApplicationsPanel mode="applicant" canApply />
      <h2 style={{ fontSize: 16, margin: '28px 0 12px' }}>My loans and repayments</h2>
      <LoansPortfolio showFarmer={false} />
      <div style={{ marginTop: 28 }}>
        <button className="btn-secondary" onClick={() => setShowProfile((v) => !v)}>{showProfile ? 'Hide' : 'Show'} my credit profile</button>
        {showProfile && farmerId && <div className="glass-card" style={{ padding: 18, marginTop: 12 }}><CreditProfileView farmerId={farmerId} /></div>}
      </div>
    </div>
  );
}
