'use client';
import { useEffect, useMemo, useState } from 'react';
import { motion, useReducedMotion } from 'motion/react';
import { HugeiconsIcon } from '@hugeicons/react';
import { Search01Icon, Cancel01Icon, Shield01Icon } from '@hugeicons/core-free-icons';
import { rolesApi } from '@/lib/api';
import Modal from '@/components/Modal';
import { MetricTile, MetricTileSkeleton } from '@/components/role-dashboards/DashboardPrimitives';

interface Role {
  id: string;
  name: string;
  description?: string | null;
  isSystem: boolean;
  systemRole?: string | null;
  isActive: boolean;
  permissionCount: number;
  userCount: number;
}

interface Resource {
  id: string;
  key: string;
  label: string;
}

const ACTIONS: { key: 'VIEW' | 'CREATE' | 'EDIT' | 'DELETE'; label: string }[] = [
  { key: 'VIEW', label: 'View' },
  { key: 'CREATE', label: 'Create' },
  { key: 'EDIT', label: 'Edit' },
  { key: 'DELETE', label: 'Delete' },
];

const TYPE_OPTIONS = [
  { value: '', label: 'All roles' },
  { value: 'custom', label: 'Custom roles' },
  { value: 'system', label: 'System roles' },
];

const EMPTY_FORM = { name: '', description: '' };

export default function RolesPage() {
  const reduce = useReducedMotion();
  const [roles, setRoles] = useState<Role[]>([]);
  const [resources, setResources] = useState<Resource[]>([]);
  const [loading, setLoading] = useState(true);

  const [search, setSearch] = useState('');
  const [debouncedSearch, setDebouncedSearch] = useState('');
  const [typeFilter, setTypeFilter] = useState('');

  const [showCreate, setShowCreate] = useState(false);
  const [form, setForm] = useState({ ...EMPTY_FORM });
  const [creating, setCreating] = useState(false);
  const [error, setError] = useState('');

  const [permRoleId, setPermRoleId] = useState<string | null>(null);
  const [permMatrix, setPermMatrix] = useState<Record<string, Set<string>>>({});
  const [permLoading, setPermLoading] = useState(false);
  const [permSaving, setPermSaving] = useState(false);

  const load = () => {
    setLoading(true);
    Promise.all([rolesApi.getAll(), rolesApi.getResources()])
      .then(([rolesRes, resourcesRes]) => {
        setRoles(rolesRes.data || []);
        setResources(resourcesRes.data || []);
      })
      .catch(console.error)
      .finally(() => setLoading(false));
  };

  useEffect(() => { load(); }, []);

  useEffect(() => {
    const timer = setTimeout(() => setDebouncedSearch(search.trim().toLowerCase()), 300);
    return () => clearTimeout(timer);
  }, [search]);

  const filtered = useMemo(() => {
    return roles.filter((r) => {
      if (typeFilter === 'custom' && r.isSystem) return false;
      if (typeFilter === 'system' && !r.isSystem) return false;
      if (debouncedSearch) {
        const haystack = `${r.name} ${r.description ?? ''}`.toLowerCase();
        if (!haystack.includes(debouncedSearch)) return false;
      }
      return true;
    });
  }, [roles, typeFilter, debouncedSearch]);

  const activeChips = useMemo(() => {
    const chips: { key: string; label: string; clear: () => void }[] = [];
    if (debouncedSearch) chips.push({ key: 'search', label: `“${debouncedSearch}”`, clear: () => setSearch('') });
    if (typeFilter) {
      const label = TYPE_OPTIONS.find((o) => o.value === typeFilter)?.label ?? typeFilter;
      chips.push({ key: 'type', label, clear: () => setTypeFilter('') });
    }
    return chips;
  }, [debouncedSearch, typeFilter]);

  const resetFilters = () => { setSearch(''); setTypeFilter(''); };

  const createRole = async (e: React.FormEvent) => {
    e.preventDefault();
    setCreating(true);
    setError('');
    try {
      await rolesApi.create({ name: form.name, description: form.description || undefined });
      setForm({ ...EMPTY_FORM });
      setShowCreate(false);
      load();
    } catch (err: any) {
      setError(err?.response?.data?.message || 'Could not create role.');
    } finally {
      setCreating(false);
    }
  };

  const removeRole = async (role: Role) => {
    if (!confirm(`Delete the "${role.name}" role?`)) return;
    try {
      await rolesApi.remove(role.id);
      load();
    } catch (err: any) {
      alert(err?.response?.data?.message || 'Could not delete role.');
    }
  };

  const openPermissions = async (role: Role) => {
    setPermRoleId(role.id);
    setPermLoading(true);
    try {
      const res = await rolesApi.getPermissions(role.id);
      const matrix: Record<string, Set<string>> = {};
      for (const row of res.data || []) {
        matrix[row.resourceKey] = new Set(row.actions);
      }
      setPermMatrix(matrix);
    } catch {
      setPermMatrix({});
    } finally {
      setPermLoading(false);
    }
  };

  const toggleAction = (resourceKey: string, action: string) => {
    setPermMatrix((prev) => {
      const next = { ...prev };
      const set = new Set(next[resourceKey] ?? []);
      if (set.has(action)) set.delete(action); else set.add(action);
      next[resourceKey] = set;
      return next;
    });
  };

  const savePermissions = async () => {
    if (!permRoleId) return;
    setPermSaving(true);
    try {
      const permissions = resources.map((r) => ({
        resourceKey: r.key,
        actions: Array.from(permMatrix[r.key] ?? []),
      }));
      await rolesApi.setPermissions(permRoleId, { permissions });
      setPermRoleId(null);
      load();
    } catch (err: any) {
      alert(err?.response?.data?.message || 'Could not save permissions.');
    } finally {
      setPermSaving(false);
    }
  };

  const permRole = roles.find((r) => r.id === permRoleId);
  const totalRoles = roles.length;
  const customRoles = roles.filter((r) => !r.isSystem).length;
  const systemRoles = roles.filter((r) => r.isSystem).length;
  const staffAssigned = roles.reduce((sum, r) => sum + r.userCount, 0);

  return (
    <div className="page-shell farmers-page">
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: '16px' }}>
        <div>
          <div style={{ display: 'flex', alignItems: 'center', gap: '10px', marginBottom: '4px' }}>
            <div style={{ width: '4px', height: '26px', background: 'linear-gradient(to bottom, var(--accent), var(--green-400))', borderRadius: '9999px' }} />
            <h1 style={{ fontFamily: 'Outfit, sans-serif', fontSize: '24px', fontWeight: 800, color: 'var(--text-primary)' }}>Roles &amp; Permissions</h1>
          </div>
          <p style={{ fontSize: '13px', color: 'var(--neutral-500)', marginLeft: '14px' }}>Define custom roles and their exact access to each resource</p>
        </div>
        <button className="btn-primary" onClick={() => setShowCreate(true)}>+ New role</button>
      </div>

      {showCreate && (
        <Modal
          title="New role"
          subtitle="Starts with no permissions — grant access from the role's Manage permissions screen."
          onClose={() => { setShowCreate(false); setError(''); }}
          width="480px"
          footer={
            <>
              <button className="btn-secondary" onClick={() => { setShowCreate(false); setError(''); }} disabled={creating}>Cancel</button>
              <button className="btn-primary" onClick={createRole} disabled={creating}>{creating ? 'Saving…' : 'Create role'}</button>
            </>
          }
        >
          <form onSubmit={createRole} style={{ display: 'grid', gap: '9px' }}>
            <input className="input-field" placeholder="Role name (e.g. Regional Auditor)" required value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} />
            <input className="input-field" placeholder="Description (optional)" value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })} />
          </form>
          {error && <div style={{ color: 'var(--red-400)', fontSize: '13px', marginTop: '12px' }}>{error}</div>}
        </Modal>
      )}

      {permRoleId && (
        <Modal
          title={`Manage permissions — ${permRole?.name ?? ''}`}
          subtitle="View / Create / Edit / Delete access per resource."
          onClose={() => setPermRoleId(null)}
          width="560px"
          footer={
            <>
              <button className="btn-secondary" onClick={() => setPermRoleId(null)} disabled={permSaving}>Cancel</button>
              <button className="btn-primary" onClick={savePermissions} disabled={permSaving || permLoading}>{permSaving ? 'Saving…' : 'Save permissions'}</button>
            </>
          }
        >
          {permLoading ? (
            <div style={{ padding: '24px 0', textAlign: 'center', color: 'var(--neutral-500)', fontSize: '13px' }}>Loading…</div>
          ) : (
            <div style={{ overflowX: 'auto' }}>
              <table className="data-table">
                <thead>
                  <tr>
                    <th>Resource</th>
                    {ACTIONS.map((a) => <th key={a.key} className="num">{a.label}</th>)}
                  </tr>
                </thead>
                <tbody>
                  {resources.map((resource) => (
                    <tr key={resource.id}>
                      <td style={{ fontWeight: 600, color: 'var(--text-primary)', fontSize: '13px' }}>{resource.label}</td>
                      {ACTIONS.map((a) => (
                        <td key={a.key} className="num">
                          <input
                            type="checkbox"
                            checked={permMatrix[resource.key]?.has(a.key) ?? false}
                            onChange={() => toggleAction(resource.key, a.key)}
                          />
                        </td>
                      ))}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </Modal>
      )}

      {/* Summary */}
      <div className="role-grid farmers-summary">
        {loading ? (
          <>
            <MetricTileSkeleton />
            <MetricTileSkeleton />
            <MetricTileSkeleton />
            <MetricTileSkeleton />
          </>
        ) : (
          <>
            <MetricTile label="Total roles" value={totalRoles} hint="System + custom" tone="green" />
            <MetricTile label="Custom roles" value={customRoles} hint="Admin-defined" tone="blue" />
            <MetricTile label="System roles" value={systemRoles} hint="Built-in tiers" tone="gold" />
            <MetricTile label="Staff assigned" value={staffAssigned} hint="Accounts using a custom role" tone="red" />
          </>
        )}
      </div>

      {/* Unified list workspace */}
      <section className="glass-card farmers-workspace farmers-workspace-tint">
        <div className="farmers-toolbar">
          <div className="farmers-toolbar-main">
            <div className="farmers-search">
              <HugeiconsIcon icon={Search01Icon} size={15} strokeWidth={2} />
              <input
                id="roles-search"
                type="search"
                placeholder="Search role name or description…"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
              />
            </div>

            <select
              className="farmers-select"
              value={typeFilter}
              onChange={(e) => setTypeFilter(e.target.value)}
              aria-label="Role type"
            >
              {TYPE_OPTIONS.map((o) => (
                <option key={o.value} value={o.value}>{o.label}</option>
              ))}
            </select>
          </div>

          {activeChips.length > 0 && (
            <div className="farmers-chips">
              {activeChips.map((chip) => (
                <button key={chip.key} type="button" className="farmers-chip" onClick={chip.clear}>
                  {chip.label}
                  <HugeiconsIcon icon={Cancel01Icon} size={11} strokeWidth={2.2} />
                </button>
              ))}
              <button type="button" className="farmers-chip-clear" onClick={resetFilters}>
                Clear all
              </button>
            </div>
          )}
        </div>

        {loading ? (
          <div className="farmers-skeleton">
            {[...Array(6)].map((_, i) => (
              <div key={i} className="farmers-skeleton-row">
                <div className="skeleton" style={{ width: 36, height: 36, borderRadius: 999 }} />
                <div style={{ flex: 1 }}>
                  <div className="skeleton skeleton-text" style={{ width: '38%', marginBottom: 8 }} />
                  <div className="skeleton skeleton-text" style={{ width: '22%' }} />
                </div>
                <div className="skeleton skeleton-text" style={{ width: 72 }} />
                <div className="skeleton skeleton-text" style={{ width: 88 }} />
              </div>
            ))}
          </div>
        ) : filtered.length === 0 ? (
          <div className="builder-empty farmers-empty">
            <span className="icon-chip" style={{ width: 52, height: 52, borderRadius: 16 }}>
              <HugeiconsIcon icon={Shield01Icon} size={24} strokeWidth={1.8} />
            </span>
            <div className="farmers-empty-title">No roles found</div>
            <div className="farmers-empty-copy">
              {activeChips.length > 0
                ? 'Nothing matches the current filters. Clear one or more filters to widen the list.'
                : 'No roles have been created yet.'}
            </div>
            {activeChips.length > 0 && (
              <button className="btn-secondary" style={{ fontSize: 12, padding: '8px 14px', marginTop: 4 }} onClick={resetFilters}>
                Clear all filters
              </button>
            )}
          </div>
        ) : (
          <div className="farmers-table-wrap">
            <table className="data-table farmers-table">
              <thead>
                <tr>
                  <th>Role</th>
                  <th>Type</th>
                  <th className="num">Permissions</th>
                  <th className="num">Staff</th>
                  <th></th>
                </tr>
              </thead>
              <tbody>
                {filtered.map((role, i) => (
                  <motion.tr
                    key={role.id}
                    initial={reduce ? false : { opacity: 0, y: 6 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ duration: 0.22, delay: Math.min(i * 0.03, 0.24), ease: [0.16, 1, 0.3, 1] }}
                  >
                    <td>
                      <div className="farmers-name">{role.name}</div>
                      <div className="farmers-phone">{role.description || '—'}</div>
                    </td>
                    <td>
                      <span className={`badge ${role.isSystem ? 'badge-gray' : 'badge-green'}`}>
                        {role.isSystem ? 'System' : 'Custom'}
                      </span>
                    </td>
                    <td className="num">
                      <span className="farmers-size">{role.isSystem ? '—' : role.permissionCount}</span>
                    </td>
                    <td className="num">
                      <span className="farmers-size">{role.userCount}</span>
                    </td>
                    <td>
                      {!role.isSystem && (
                        <div style={{ display: 'flex', gap: 6, justifyContent: 'flex-end' }}>
                          <button className="btn-secondary" style={{ fontSize: 11, padding: '5px 10px' }} onClick={() => openPermissions(role)}>
                            Manage permissions
                          </button>
                          <button className="btn-secondary" style={{ fontSize: 11, padding: '5px 10px' }} onClick={() => removeRole(role)}>
                            Delete
                          </button>
                        </div>
                      )}
                    </td>
                  </motion.tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>
    </div>
  );
}
