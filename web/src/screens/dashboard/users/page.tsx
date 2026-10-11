'use client';
import { useEffect, useMemo, useState } from 'react';
import { HugeiconsIcon } from '@hugeicons/react';
import { Search01Icon, UserAdd01Icon } from '@hugeicons/core-free-icons';
import { rolesApi, usersApi } from '@/lib/api';
import { apiErrorMessage } from '@/lib/api-error';
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
  mamcosId?: string | null;
  mamcos?: { name: string } | null;
  customRole?: { id: string; name: string } | null;
  isActive: boolean;
  lastLoginAt?: string;
  createdAt: string;
}

interface CustomRoleOption {
  id: string;
  name: string;
  mamcosId?: string | null;
  mamcosName?: string | null;
  isSystem: boolean;
  isActive: boolean;
}

type StatusFilter = 'all' | 'active' | 'inactive' | 'unassigned';

const needsRole = (u: PlatformUser) => u.role !== 'SUPER_ADMIN' && !u.roleId;

function initials(u: PlatformUser) {
  const letters = `${u.firstName?.[0] ?? ''}${u.lastName?.[0] ?? ''}`.toUpperCase();
  return letters || u.phone.slice(-2);
}

function lastLogin(iso?: string) {
  if (!iso) return 'Never';
  const days = Math.floor((Date.now() - new Date(iso).getTime()) / 86_400_000);
  if (days <= 0) return 'Today';
  if (days === 1) return 'Yesterday';
  if (days < 30) return `${days} days ago`;
  return new Date(iso).toLocaleDateString(undefined, { day: 'numeric', month: 'short', year: 'numeric' });
}

export default function UsersPage() {
  const [users, setUsers] = useState<PlatformUser[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [roleFilter, setRoleFilter] = useState('');
  const [statusFilter, setStatusFilter] = useState<StatusFilter>('all');
  const [busyId, setBusyId] = useState<string | null>(null);
  const [notice, setNotice] = useState<{ kind: 'success' | 'error'; text: string } | null>(null);
  const [showCreate, setShowCreate] = useState(false);
  // Super Admin manages every account. A cooperative admin (an account tied to an AMCOS)
  // manages their own cooperative's staff, within the grants they hold; the API enforces both.
  const currentUser = useAuthStore((s) => s.user);
  const isSuperAdmin = currentUser?.role === 'SUPER_ADMIN';
  const ownMamcosId = isSuperAdmin ? null : currentUser?.mamcosId ?? null;
  const isCooperativeAdmin = !!ownMamcosId;
  const canEditAccounts = hasPermission(currentUser, 'users', 'EDIT');
  const canCreateAccounts = isSuperAdmin || (isCooperativeAdmin && hasPermission(currentUser, 'users', 'CREATE'));
  const canAssignRoles = isSuperAdmin || (isCooperativeAdmin && canEditAccounts);
  const canLoadRoles = isSuperAdmin || (isCooperativeAdmin && hasPermission(currentUser, 'roles', 'VIEW'));

  const [customRoles, setCustomRoles] = useState<CustomRoleOption[]>([]);

  const fetchAll = () =>
    // The roles catalog is scoped server-side: everything for Super Admin, own AMCOS otherwise.
    Promise.allSettled([usersApi.getAll(), canLoadRoles ? rolesApi.getAll() : Promise.resolve({ data: [] })])
      .then(([usersRes, rolesRes]) => {
        if (usersRes.status === 'fulfilled') setUsers(usersRes.value.data || []);
        else setNotice({ kind: 'error', text: apiErrorMessage(usersRes.reason, 'Unable to load accounts.') });
        if (rolesRes.status === 'fulfilled') {
          setCustomRoles(
            (rolesRes.value.data || []).filter((r: CustomRoleOption) => !r.isSystem && r.isActive),
          );
        } else {
          setNotice({ kind: 'error', text: apiErrorMessage(rolesRes.reason, 'Unable to load roles.') });
        }
      })
      .finally(() => setLoading(false));

  const load = () => { setLoading(true); fetchAll(); };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  useEffect(() => { fetchAll(); }, []);

  /** Roles that may be assigned to this account: platform roles plus its own cooperative's. */
  const rolesFor = (user: PlatformUser) =>
    isSuperAdmin ? customRoles.filter((r) => !r.mamcosId || r.mamcosId === user.mamcosId) : customRoles;

  const counts = useMemo(() => ({
    all: users.length,
    active: users.filter((u) => u.isActive).length,
    inactive: users.filter((u) => !u.isActive).length,
    unassigned: users.filter(needsRole).length,
  }), [users]);

  const filtered = users.filter((u) => {
    if (roleFilter && (u.role === 'SUPER_ADMIN' ? 'SUPER_ADMIN' : u.roleId || 'unassigned') !== roleFilter) return false;
    if (statusFilter === 'active' && !u.isActive) return false;
    if (statusFilter === 'inactive' && u.isActive) return false;
    if (statusFilter === 'unassigned' && !needsRole(u)) return false;
    const haystack = `${u.firstName || ''} ${u.lastName || ''} ${u.phone} ${u.email || ''}`.toLowerCase();
    return haystack.includes(search.toLowerCase());
  });

  const changeRole = async (user: PlatformUser, selection: string) => {
    if (!selection) return;
    setBusyId(user.id);
    setNotice(null);
    try {
      const data = selection === 'SUPER_ADMIN' ? { role: 'SUPER_ADMIN' } : { roleId: selection };
      const res = await usersApi.update(user.id, data);
      setUsers((prev) => prev.map((u) => u.id === user.id ? { ...u, ...res.data } : u));
      setNotice({ kind: 'success', text: `Role updated for ${user.firstName || user.phone}.` });
    } catch (err) {
      setNotice({ kind: 'error', text: apiErrorMessage(err, 'Unable to change role.') });
    } finally {
      setBusyId(null);
    }
  };

  const toggleActive = async (user: PlatformUser) => {
    setBusyId(user.id);
    setNotice(null);
    try {
      await usersApi.update(user.id, { isActive: !user.isActive });
      setUsers((prev) => prev.map((u) => (u.id === user.id ? { ...u, isActive: !u.isActive } : u)));
    } catch (err) {
      setNotice({ kind: 'error', text: apiErrorMessage(err, 'Unable to update account status.') });
    } finally {
      setBusyId(null);
    }
  };

  const tiles: { key: StatusFilter; label: string; warn?: boolean }[] = [
    { key: 'all', label: 'Total accounts' },
    { key: 'active', label: 'Active' },
    { key: 'inactive', label: 'Deactivated' },
    { key: 'unassigned', label: 'Need a role', warn: true },
  ];

  return (
    <div className="ua-page">
      <div className="ua-head">
        <div>
          <h1 className="ua-title">User Accounts</h1>
          <p className="ua-sub">
            {isCooperativeAdmin
              ? 'The people who work in your cooperative. Assign the roles you created in Roles & Permissions and switch accounts on or off.'
              : 'Everyone who can sign in to the platform. Assign the roles you created in Roles & Permissions and switch accounts on or off.'}
          </p>
        </div>
        {canCreateAccounts && (
          <button className="btn-primary" onClick={() => setShowCreate(true)}>
            <HugeiconsIcon icon={UserAdd01Icon} size={17} strokeWidth={1.8} />
            New account
          </button>
        )}
      </div>

      <div className="ua-stats" role="group" aria-label="Filter by status">
        {tiles.map((t) => (
          <button
            key={t.key}
            type="button"
            className={`ua-stat${t.warn && counts[t.key] > 0 ? ' is-warn' : ''}`}
            aria-pressed={statusFilter === t.key}
            onClick={() => setStatusFilter(statusFilter === t.key ? 'all' : t.key)}
          >
            <div className="ua-stat-value">{loading ? '–' : counts[t.key]}</div>
            <div className="ua-stat-label">{t.label}</div>
          </button>
        ))}
      </div>

      <div className="ua-toolbar">
        <div className="ua-search">
          <HugeiconsIcon icon={Search01Icon} size={17} strokeWidth={1.8} />
          <input
            type="search"
            aria-label="Search accounts"
            placeholder="Search name, phone or email"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="input-field"
          />
        </div>
        <select className="input-field" aria-label="Filter by role" value={roleFilter} onChange={(e) => setRoleFilter(e.target.value)}>
          <option value="">All roles</option>
          <option value="SUPER_ADMIN">Super Admin</option>
          <option value="unassigned">Needs role assignment</option>
          {customRoles.map((r) => <option key={r.id} value={r.id}>{r.name}{r.mamcosName ? ` (${r.mamcosName})` : ''}</option>)}
        </select>
      </div>

      {notice && (
        <div role={notice.kind === 'error' ? 'alert' : 'status'} className={`alert-box ${notice.kind === 'error' ? 'alert-danger' : 'alert-success'}`}>
          {notice.text}
        </div>
      )}

      {showCreate && (
        <CreateAccountModal
          customRoles={customRoles}
          isSuperAdmin={isSuperAdmin}
          ownMamcosId={ownMamcosId}
          onClose={() => setShowCreate(false)}
          onCreated={(name) => {
            setNotice({ kind: 'success', text: `Account created for ${name}.` });
            load();
          }}
        />
      )}

      <div className="ua-panel">
        <div className="ua-scroll">
          <table className="data-table ua-table">
            <thead>
              <tr>
                <th>Account</th>
                <th>Phone</th>
                <th>Role</th>
                <th>Status</th>
                <th>Last sign-in</th>
                <th style={{ textAlign: 'right' }}>Actions</th>
              </tr>
            </thead>
            <tbody>
              {loading && Array.from({ length: 5 }).map((_, i) => (
                <tr key={i} className="ua-skel-row">
                  {Array.from({ length: 6 }).map((__, j) => <td key={j}><div className="ua-skel" style={{ width: j === 0 ? '70%' : '55%' }} /></td>)}
                </tr>
              ))}
              {!loading && filtered.map((user) => {
                const isSuper = user.role === 'SUPER_ADMIN';
                const name = `${user.firstName || ''} ${user.lastName || ''}`.trim() || 'Unnamed account';
                return (
                  <tr key={user.id}>
                    <td>
                      <div className="ua-person">
                        <span className={`ua-avatar${isSuper ? ' is-super' : ''}${user.isActive ? '' : ' is-off'}`} aria-hidden="true">{initials(user)}</span>
                        <div style={{ minWidth: 0 }}>
                          <div className="ua-name">{name}</div>
                          <div className="ua-email">{[user.email || 'No email', isSuperAdmin ? user.mamcos?.name : null].filter(Boolean).join(' · ')}</div>
                        </div>
                      </div>
                    </td>
                    <td className="ua-phone">{user.phone}</td>
                    <td>
                      {canAssignRoles && !(isCooperativeAdmin && user.id === currentUser?.id) ? (
                        <select
                          className="input-field ua-role-select"
                          aria-label={`Role for ${name}`}
                          value={isSuper ? 'SUPER_ADMIN' : user.roleId || ''}
                          disabled={busyId === user.id}
                          onChange={(e) => changeRole(user, e.target.value)}
                        >
                          <option value="" disabled>Needs role assignment</option>
                          {isSuperAdmin && <option value="SUPER_ADMIN">Super Admin</option>}
                          {user.roleId && !rolesFor(user).some((r) => r.id === user.roleId) && (
                            <option value={user.roleId} disabled>{user.customRole?.name || 'Inactive role'} — reassign</option>
                          )}
                          {rolesFor(user).map((r) => <option key={r.id} value={r.id}>{r.name}</option>)}
                        </select>
                      ) : (
                        <span className={`ua-role-chip${needsRole(user) ? ' is-unassigned' : ''}`}>
                          {isSuper ? 'Super Admin' : user.customRole?.name || 'Needs role assignment'}
                        </span>
                      )}
                    </td>
                    <td><span className={`ua-status ${user.isActive ? 'is-on' : 'is-off'}`}>{user.isActive ? 'Active' : 'Deactivated'}</span></td>
                    <td className="ua-muted">{lastLogin(user.lastLoginAt)}</td>
                    <td style={{ textAlign: 'right' }}>
                      <button
                        className={`btn-secondary ua-action${user.isActive ? ' is-danger' : ''}`}
                        disabled={busyId === user.id || !canEditAccounts || (isSuper && !isSuperAdmin) || (user.id === currentUser?.id && !isSuperAdmin)}
                        onClick={() => toggleActive(user)}
                      >
                        {user.isActive ? 'Deactivate' : 'Activate'}
                      </button>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
        {!loading && filtered.length === 0 && (
          <div className="ua-empty">
            <strong>{users.length === 0 ? 'No accounts yet' : 'No accounts match your filters'}</strong>
            {users.length === 0
              ? (isSuperAdmin ? 'Create the first account with the New account button.' : 'Accounts will appear here once they are created.')
              : 'Try a different search, role or status.'}
          </div>
        )}
      </div>

      <div className="ua-foot" aria-live="polite">
        {!loading && `Showing ${filtered.length} of ${users.length} accounts`}
      </div>
    </div>
  );
}
