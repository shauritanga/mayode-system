'use client';
import { useEffect, useState } from 'react';
import { usersApi } from '@/lib/api';

interface PlatformUser {
  id: string;
  phone: string;
  email?: string;
  firstName?: string;
  lastName?: string;
  role: string;
  isActive: boolean;
  lastLoginAt?: string;
  createdAt: string;
}

const ROLES = ['SUPER_ADMIN', 'ADMIN', 'FIELD_OFFICER', 'FARMER', 'MAMCOS_SECRETARY', 'AUDITOR', 'BUYER', 'FINANCIAL_PROVIDER'];

export default function UsersPage() {
  const [users, setUsers] = useState<PlatformUser[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [roleFilter, setRoleFilter] = useState('');
  const [busyId, setBusyId] = useState<string | null>(null);
  const [message, setMessage] = useState('');

  const load = () => {
    setLoading(true);
    usersApi.getAll()
      .then((res) => setUsers(res.data || []))
      .catch(console.error)
      .finally(() => setLoading(false));
  };

  useEffect(() => { load(); }, []);

  const filtered = users.filter((u) => {
    if (roleFilter && u.role !== roleFilter) return false;
    const haystack = `${u.firstName || ''} ${u.lastName || ''} ${u.phone} ${u.email || ''}`.toLowerCase();
    return haystack.includes(search.toLowerCase());
  });

  const changeRole = async (user: PlatformUser, role: string) => {
    if (role === user.role) return;
    setBusyId(user.id);
    setMessage('');
    try {
      await usersApi.update(user.id, { role });
      setUsers((prev) => prev.map((u) => (u.id === user.id ? { ...u, role } : u)));
      setMessage(`Role updated for ${user.firstName || user.phone}.`);
    } catch (err: any) {
      setMessage(err?.response?.data?.message || 'Unable to change role.');
    } finally {
      setBusyId(null);
    }
  };

  const toggleActive = async (user: PlatformUser) => {
    setBusyId(user.id);
    setMessage('');
    try {
      await usersApi.update(user.id, { isActive: !user.isActive });
      setUsers((prev) => prev.map((u) => (u.id === user.id ? { ...u, isActive: !u.isActive } : u)));
    } catch (err: any) {
      setMessage(err?.response?.data?.message || 'Unable to update account status.');
    } finally {
      setBusyId(null);
    }
  };

  return (
    <div>
      <div style={{ marginBottom: '28px', display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: '16px' }}>
        <div>
          <div style={{ display: 'flex', alignItems: 'center', gap: '10px', marginBottom: '4px' }}>
            <div style={{ width: '4px', height: '26px', background: 'linear-gradient(to bottom, var(--accent), var(--green-400))', borderRadius: '9999px' }} />
            <h1 style={{ fontFamily: 'Outfit, sans-serif', fontSize: '24px', fontWeight: 800, color: 'var(--text-primary)' }}>Users &amp; Roles</h1>
          </div>
          <p style={{ fontSize: '13px', color: 'var(--neutral-500)', marginLeft: '14px' }}>Every platform account, across all roles — edit role or deactivate.</p>
        </div>
        <div style={{ display: 'flex', gap: '12px', alignItems: 'center' }}>
          <select className="input-field" style={{ width: '200px' }} value={roleFilter} onChange={(e) => setRoleFilter(e.target.value)}>
            <option value="">All roles</option>
            {ROLES.map((role) => <option key={role} value={role}>{role.replace(/_/g, ' ')}</option>)}
          </select>
          <input
            type="search"
            placeholder="Search name, phone, email…"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="input-field"
            style={{ width: '280px' }}
          />
        </div>
      </div>

      {message && <div className="alert-box alert-success" style={{ marginBottom: 16 }}>{message}</div>}

      <div className="glass-card" style={{ overflow: 'hidden' }}>
        {loading ? (
          <div style={{ padding: '48px', textAlign: 'center', color: 'var(--neutral-500)', fontSize: '14px' }}>Loading users…</div>
        ) : filtered.length === 0 ? (
          <div style={{ padding: '48px', textAlign: 'center', color: 'var(--neutral-500)', fontSize: '14px' }}>No users match your filters.</div>
        ) : (
          <div style={{ overflowX: 'auto' }}>
            <table className="data-table">
              <thead>
                <tr>
                  <th>Name</th>
                  <th>Phone</th>
                  <th>Email</th>
                  <th>Role</th>
                  <th>Status</th>
                  <th>Last login</th>
                  <th>Actions</th>
                </tr>
              </thead>
              <tbody>
                {filtered.map((user) => (
                  <tr key={user.id}>
                    <td style={{ fontWeight: 600, color: 'var(--text-primary)' }}>{user.firstName || ''} {user.lastName || ''}</td>
                    <td style={{ fontFamily: 'monospace', fontSize: '12px', color: 'var(--neutral-400)' }}>{user.phone}</td>
                    <td style={{ fontSize: '12px', color: 'var(--neutral-400)' }}>{user.email || '—'}</td>
                    <td>
                      <select
                        className="input-field"
                        style={{ fontSize: '12px', padding: '4px 8px', minWidth: '160px' }}
                        value={user.role}
                        disabled={busyId === user.id}
                        onChange={(e) => changeRole(user, e.target.value)}
                      >
                        {ROLES.map((role) => <option key={role} value={role}>{role.replace(/_/g, ' ')}</option>)}
                      </select>
                    </td>
                    <td><span className={`badge ${user.isActive ? 'badge-green' : 'badge-red'}`}>{user.isActive ? 'Active' : 'Deactivated'}</span></td>
                    <td style={{ fontSize: '12px', color: 'var(--neutral-500)' }}>{user.lastLoginAt ? new Date(user.lastLoginAt).toLocaleDateString() : 'Never'}</td>
                    <td>
                      <button
                        className="btn-secondary"
                        style={{ fontSize: '12px', padding: '4px 10px' }}
                        disabled={busyId === user.id}
                        onClick={() => toggleActive(user)}
                      >
                        {user.isActive ? 'Deactivate' : 'Activate'}
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      <div style={{ marginTop: '14px', fontSize: '12px', color: 'var(--neutral-600)' }}>
        Showing {filtered.length} of {users.length} accounts
      </div>
    </div>
  );
}
