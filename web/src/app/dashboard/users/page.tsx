'use client';
import { useEffect, useState } from 'react';
import { rolesApi, usersApi } from '@/lib/api';
import { useAuthStore } from '@/store/auth.store';
import { hasPermission } from '@/lib/nav';
import CreateAccountModal from './CreateAccountModal';

interface PlatformUser {
  id: string;
  phone: string;
  email?: string;
  firstName?: string;
  lastName?: string;
  role: string;
  roleId?: string | null;
  customRole?: { id: string; name: string } | null;
  isActive: boolean;
  lastLoginAt?: string;
  createdAt: string;
}

interface CustomRoleOption {
  id: string;
  name: string;
  systemRole?: string | null;
  isSystem: boolean;
  isActive: boolean;
}

export default function UsersPage() {
  const [users, setUsers] = useState<PlatformUser[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [roleFilter, setRoleFilter] = useState('');
  const [busyId, setBusyId] = useState<string | null>(null);
  const [message, setMessage] = useState('');
  const [showCreate, setShowCreate] = useState(false);
  // Role management and custom-role assignment are SUPER_ADMIN-only;
  // Other users need explicit users grants.
  const currentUser = useAuthStore((s) => s.user);
  const isSuperAdmin = currentUser?.role === 'SUPER_ADMIN';
  const canEditAccounts = hasPermission(currentUser, 'users', 'EDIT');

  const [customRoles, setCustomRoles] = useState<CustomRoleOption[]>([]);

  const load = () => {
    setLoading(true);
    // Only Super Admin can fetch the assignment catalog.
    Promise.allSettled([usersApi.getAll(), isSuperAdmin ? rolesApi.getAll() : Promise.resolve({ data: [] })])
      .then(([usersRes, rolesRes]) => {
        if (usersRes.status === 'fulfilled') setUsers(usersRes.value.data || []);
        else console.error(usersRes.reason);
        if (rolesRes.status === 'fulfilled') {
          setCustomRoles(
            (rolesRes.value.data || []).filter((r: CustomRoleOption) => !r.isSystem && r.isActive),
          );
        }
      })
      .finally(() => setLoading(false));
  };

  useEffect(() => { load(); }, []);

  const filtered = users.filter((u) => {
    if (roleFilter && (u.role === 'SUPER_ADMIN' ? 'SUPER_ADMIN' : u.roleId || 'unassigned') !== roleFilter) return false;
    const haystack = `${u.firstName || ''} ${u.lastName || ''} ${u.phone} ${u.email || ''}`.toLowerCase();
    return haystack.includes(search.toLowerCase());
  });

  const changeRole = async (user: PlatformUser, selection: string) => {
    if (!selection) return;
    setBusyId(user.id);
    setMessage('');
    try {
      const data = selection === 'SUPER_ADMIN' ? { role: 'SUPER_ADMIN' } : { roleId: selection };
      const res = await usersApi.update(user.id, data);
      setUsers((prev) => prev.map((u) => u.id === user.id ? { ...u, ...res.data } : u));
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
          <p style={{ fontSize: '13px', color: 'var(--neutral-500)', marginLeft: '14px' }}>Every platform account, across all roles — assign roles created by Super Admin and manage account status.</p>
        </div>
        <div style={{ display: 'flex', gap: '12px', alignItems: 'center' }}>
          {isSuperAdmin && <button className="btn-primary" onClick={() => setShowCreate(true)}>+ New account</button>}
        </div>
      </div>

      <div style={{ display: 'flex', gap: '12px', alignItems: 'center', flexWrap: 'wrap', marginBottom: '20px' }}>
        <input
          type="search"
          placeholder="Search name, phone, email…"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          className="input-field"
          style={{ width: '280px' }}
        />
        <select className="input-field" style={{ width: '200px' }} value={roleFilter} onChange={(e) => setRoleFilter(e.target.value)}>
          <option value="">All roles</option>
          <option value="SUPER_ADMIN">Super Admin</option>
          <option value="unassigned">Needs role assignment</option>
          {customRoles.map((r) => <option key={r.id} value={r.id}>{r.name}</option>)}
        </select>
      </div>

      {message && <div className="alert-box alert-success" style={{ marginBottom: 16 }}>{message}</div>}

      {showCreate && (
        <CreateAccountModal
          customRoles={customRoles}
          isSuperAdmin={isSuperAdmin}
          onClose={() => setShowCreate(false)}
          onCreated={(name) => {
            setMessage(`Account created for ${name}.`);
            load();
          }}
        />
      )}

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
                      {isSuperAdmin ? (
                        <select className="input-field" value={user.role === 'SUPER_ADMIN' ? 'SUPER_ADMIN' : user.roleId || ''}
                          disabled={busyId === user.id} onChange={(e) => changeRole(user, e.target.value)}>
                          <option value="" disabled>Needs role assignment</option>
                          <option value="SUPER_ADMIN">Super Admin</option>
                          {user.roleId && !customRoles.some((r) => r.id === user.roleId) && <option value={user.roleId} disabled>{user.customRole?.name || 'Inactive role'} — reassign</option>}
                          {customRoles.map((r) => <option key={r.id} value={r.id}>{r.name}</option>)}
                        </select>
                      ) : <span>{user.role === 'SUPER_ADMIN' ? 'Super Admin' : user.customRole?.name || 'Needs role assignment'}</span>}
                    </td>
                    <td><span className={`badge ${user.isActive ? 'badge-green' : 'badge-red'}`}>{user.isActive ? 'Active' : 'Deactivated'}</span></td>
                    <td style={{ fontSize: '12px', color: 'var(--neutral-500)' }}>{user.lastLoginAt ? new Date(user.lastLoginAt).toLocaleDateString() : 'Never'}</td>
                    <td>
                      <button
                        className="btn-secondary"
                        style={{ fontSize: '12px', padding: '4px 10px' }}
                        disabled={busyId === user.id || !canEditAccounts || (user.role === 'SUPER_ADMIN' && !isSuperAdmin)}
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
