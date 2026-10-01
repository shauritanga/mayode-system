'use client';
import type { FormEvent } from 'react';
import { useEffect, useState } from 'react';
import { locationsApi, partnerApi, settingsApi } from '@/lib/api';

const tabs = ['Locations', 'Org Profile', 'Notification Templates', 'Partner API'] as const;
type Tab = (typeof tabs)[number];

export default function SettingsPage() {
  const [activeTab, setActiveTab] = useState<Tab>('Locations');

  return (
    <div className="page-shell">
      <div className="page-heading">
        <div>
          <div className="page-kicker">Platform</div>
          <h1 className="page-title">Settings</h1>
          <p className="page-subtitle">
            Admin-hierarchy locations, organization profile, notification templates, and partner API keys.
          </p>
        </div>
      </div>

      <nav className="farmer-tabbar" aria-label="Settings sections">
        {tabs.map((tab) => (
          <button
            key={tab}
            type="button"
            className={activeTab === tab ? 'active' : ''}
            onClick={() => setActiveTab(tab)}
          >
            {tab}
          </button>
        ))}
      </nav>

      {activeTab === 'Locations' && <LocationsTab />}
      {activeTab === 'Org Profile' && <OrgProfileTab />}
      {activeTab === 'Notification Templates' && <NotificationTemplatesTab />}
      {activeTab === 'Partner API' && <PartnerApiTab />}
    </div>
  );
}

function LocationsTab() {
  const [regions, setRegions] = useState<any[]>([]);
  const [selectedRegion, setSelectedRegion] = useState<any>(null);
  const [districts, setDistricts] = useState<any[]>([]);
  const [selectedDistrict, setSelectedDistrict] = useState<any>(null);
  const [wards, setWards] = useState<any[]>([]);
  const [regionName, setRegionName] = useState('');
  const [districtName, setDistrictName] = useState('');
  const [wardName, setWardName] = useState('');
  const [message, setMessage] = useState('');

  const loadRegions = () => locationsApi.getRegions().then((res) => setRegions(res.data || [])).catch(console.error);
  useEffect(() => { loadRegions(); }, []);

  const selectRegion = (region: any) => {
    setSelectedRegion(region);
    setSelectedDistrict(null);
    setWards([]);
    locationsApi.getDistricts(region.id).then((res) => setDistricts(res.data || [])).catch(console.error);
  };

  const selectDistrict = (district: any) => {
    setSelectedDistrict(district);
    locationsApi.getWards(district.id).then((res) => setWards(res.data || [])).catch(console.error);
  };

  const addRegion = async (e: FormEvent) => {
    e.preventDefault(); setMessage('');
    try {
      await locationsApi.createRegion({ name: regionName });
      setRegionName('');
      loadRegions();
    } catch (err: any) { setMessage(err?.response?.data?.message || 'Unable to add region.'); }
  };

  const addDistrict = async (e: FormEvent) => {
    e.preventDefault(); setMessage('');
    if (!selectedRegion) return;
    try {
      await locationsApi.createDistrict({ name: districtName, regionId: selectedRegion.id });
      setDistrictName('');
      selectRegion(selectedRegion);
    } catch (err: any) { setMessage(err?.response?.data?.message || 'Unable to add district.'); }
  };

  const addWard = async (e: FormEvent) => {
    e.preventDefault(); setMessage('');
    if (!selectedDistrict) return;
    try {
      await locationsApi.createWard({ name: wardName, districtId: selectedDistrict.id });
      setWardName('');
      selectDistrict(selectedDistrict);
    } catch (err: any) { setMessage(err?.response?.data?.message || 'Unable to add ward.'); }
  };

  const removeRegion = async (id: string) => {
    if (!confirm('Delete this region and all its districts/wards?')) return;
    try { await locationsApi.removeRegion(id); setSelectedRegion(null); loadRegions(); } catch (err: any) { setMessage(err?.response?.data?.message || 'Unable to delete region.'); }
  };

  return <div className="role-two-col" style={{ marginTop: 16 }}>
    {message && <div className="alert-box alert-danger" style={{ gridColumn: '1 / -1' }}>{message}</div>}
    <div className="glass-card" style={{ padding: 18 }}>
      <strong>Regions</strong>
      <form onSubmit={addRegion} style={{ display: 'flex', gap: 8, margin: '12px 0' }}>
        <input className="input-field" placeholder="New region name" required value={regionName} onChange={(e) => setRegionName(e.target.value)} />
        <button className="btn-secondary" type="submit">+ Add</button>
      </form>
      <div style={{ display: 'grid', gap: 6 }}>
        {regions.map((r) => (
          <div key={r.id} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '8px 10px', borderRadius: 8, background: selectedRegion?.id === r.id ? 'var(--surface-tint)' : 'transparent', cursor: 'pointer' }} onClick={() => selectRegion(r)}>
            <span>{r.name} <small style={{ color: 'var(--neutral-500)' }}>({r._count?.districts ?? 0} districts)</small></span>
            <button className="btn-secondary" style={{ fontSize: 11, padding: '3px 8px' }} onClick={(e) => { e.stopPropagation(); removeRegion(r.id); }}>Delete</button>
          </div>
        ))}
        {!regions.length && <p style={{ color: 'var(--neutral-500)' }}>No regions yet.</p>}
      </div>
    </div>

    <div className="glass-card" style={{ padding: 18 }}>
      <strong>Districts{selectedRegion ? ` — ${selectedRegion.name}` : ''}</strong>
      {!selectedRegion ? <p style={{ color: 'var(--neutral-500)', marginTop: 10 }}>Select a region to manage its districts.</p> : <>
        <form onSubmit={addDistrict} style={{ display: 'flex', gap: 8, margin: '12px 0' }}>
          <input className="input-field" placeholder="New district name" required value={districtName} onChange={(e) => setDistrictName(e.target.value)} />
          <button className="btn-secondary" type="submit">+ Add</button>
        </form>
        <div style={{ display: 'grid', gap: 6 }}>
          {districts.map((d) => (
            <div key={d.id} style={{ padding: '8px 10px', borderRadius: 8, background: selectedDistrict?.id === d.id ? 'var(--surface-tint)' : 'transparent', cursor: 'pointer' }} onClick={() => selectDistrict(d)}>
              {d.name} <small style={{ color: 'var(--neutral-500)' }}>({d._count?.wards ?? 0} wards)</small>
            </div>
          ))}
          {!districts.length && <p style={{ color: 'var(--neutral-500)' }}>No districts yet.</p>}
        </div>
      </>}
    </div>

    <div className="glass-card" style={{ padding: 18 }}>
      <strong>Wards{selectedDistrict ? ` — ${selectedDistrict.name}` : ''}</strong>
      {!selectedDistrict ? <p style={{ color: 'var(--neutral-500)', marginTop: 10 }}>Select a district to manage its wards.</p> : <>
        <form onSubmit={addWard} style={{ display: 'flex', gap: 8, margin: '12px 0' }}>
          <input className="input-field" placeholder="New ward name" required value={wardName} onChange={(e) => setWardName(e.target.value)} />
          <button className="btn-secondary" type="submit">+ Add</button>
        </form>
        <div style={{ display: 'grid', gap: 6 }}>
          {wards.map((w) => <div key={w.id} style={{ padding: '8px 10px' }}>{w.name}</div>)}
          {!wards.length && <p style={{ color: 'var(--neutral-500)' }}>No wards yet.</p>}
        </div>
      </>}
    </div>
  </div>;
}

function OrgProfileTab() {
  const [form, setForm] = useState({ orgName: '', logoUrl: '', contactEmail: '', contactPhone: '', address: '' });
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState('');

  useEffect(() => {
    settingsApi.getOrg()
      .then((res) => setForm({
        orgName: res.data.orgName || '',
        logoUrl: res.data.logoUrl || '',
        contactEmail: res.data.contactEmail || '',
        contactPhone: res.data.contactPhone || '',
        address: res.data.address || '',
      }))
      .catch(console.error)
      .finally(() => setLoading(false));
  }, []);

  const save = async (e: FormEvent) => {
    e.preventDefault(); setSaving(true); setMessage('');
    try {
      await settingsApi.updateOrg(form);
      setMessage('Organization profile saved.');
    } catch (err: any) {
      setMessage(err?.response?.data?.message || 'Unable to save organization profile.');
    } finally { setSaving(false); }
  };

  if (loading) return <div style={{ padding: 48, textAlign: 'center', color: 'var(--neutral-500)' }}>Loading…</div>;

  return <form onSubmit={save} className="action-panel" style={{ marginTop: 16, maxWidth: 560 }}>
    <div className="panel-header"><h2 className="panel-title">Organization profile</h2></div>
    {message && <div className={`alert-box ${message.includes('Unable') ? 'alert-danger' : 'alert-success'}`}>{message}</div>}
    <div className="form-grid-wide">
      <label className="form-label form-grid-wide">Organization name<input className="input-field" required value={form.orgName} onChange={(e) => setForm((c) => ({ ...c, orgName: e.target.value }))} /></label>
      <label className="form-label form-grid-wide">Logo URL<input className="input-field" value={form.logoUrl} onChange={(e) => setForm((c) => ({ ...c, logoUrl: e.target.value }))} /></label>
      <label className="form-label">Contact email<input className="input-field" type="email" value={form.contactEmail} onChange={(e) => setForm((c) => ({ ...c, contactEmail: e.target.value }))} /></label>
      <label className="form-label">Contact phone<input className="input-field" value={form.contactPhone} onChange={(e) => setForm((c) => ({ ...c, contactPhone: e.target.value }))} /></label>
      <label className="form-label form-grid-wide">Address<input className="input-field" value={form.address} onChange={(e) => setForm((c) => ({ ...c, address: e.target.value }))} /></label>
    </div>
    <button className="btn-primary" disabled={saving} style={{ marginTop: 12 }}>{saving ? 'Saving...' : 'Save profile'}</button>
  </form>;
}

function NotificationTemplatesTab() {
  const [templates, setTemplates] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [form, setForm] = useState({ key: '', channel: 'SMS', title: '', body: '' });
  const [editingId, setEditingId] = useState<string | null>(null);
  const [message, setMessage] = useState('');

  const load = () => {
    setLoading(true);
    settingsApi.getTemplates().then((res) => setTemplates(res.data || [])).catch(console.error).finally(() => setLoading(false));
  };
  useEffect(() => { load(); }, []);

  const submit = async (e: FormEvent) => {
    e.preventDefault(); setMessage('');
    try {
      if (editingId) await settingsApi.updateTemplate(editingId, form);
      else await settingsApi.createTemplate(form);
      setForm({ key: '', channel: 'SMS', title: '', body: '' });
      setEditingId(null);
      setMessage('Template saved.');
      load();
    } catch (err: any) { setMessage(err?.response?.data?.message || 'Unable to save template.'); }
  };

  const edit = (template: any) => {
    setEditingId(template.id);
    setForm({ key: template.key, channel: template.channel, title: template.title || '', body: template.body });
  };

  const remove = async (id: string) => {
    if (!confirm('Delete this template?')) return;
    try { await settingsApi.removeTemplate(id); load(); } catch (err: any) { setMessage(err?.response?.data?.message || 'Unable to delete template.'); }
  };

  return <div style={{ marginTop: 16 }}>
    <form onSubmit={submit} className="action-panel">
      <div className="panel-header">
        <div>
          <h2 className="panel-title">{editingId ? 'Edit template' : 'New notification template'}</h2>
          <p className="panel-copy">Key <code>weather_alert</code> is used by the Weather module's SMS broadcast. Placeholders <code>{'{alertType}'}</code>, <code>{'{title}'}</code>, <code>{'{message}'}</code> are substituted at send time.</p>
        </div>
      </div>
      {message && <div className={`alert-box ${message.includes('Unable') ? 'alert-danger' : 'alert-success'}`}>{message}</div>}
      <div className="form-grid-wide">
        <label className="form-label">Key<input className="input-field" required placeholder="weather_alert" value={form.key} onChange={(e) => setForm((c) => ({ ...c, key: e.target.value }))} disabled={!!editingId} /></label>
        <label className="form-label">Channel<select className="input-field" value={form.channel} onChange={(e) => setForm((c) => ({ ...c, channel: e.target.value }))}><option>SMS</option><option>EMAIL</option></select></label>
        <label className="form-label">Title (optional)<input className="input-field" value={form.title} onChange={(e) => setForm((c) => ({ ...c, title: e.target.value }))} /></label>
        <label className="form-label form-grid-wide">Body<textarea className="input-field" required value={form.body} onChange={(e) => setForm((c) => ({ ...c, body: e.target.value }))} /></label>
      </div>
      <div style={{ display: 'flex', gap: 8, marginTop: 12 }}>
        <button className="btn-primary" type="submit">{editingId ? 'Save changes' : 'Add template'}</button>
        {editingId && <button className="btn-secondary" type="button" onClick={() => { setEditingId(null); setForm({ key: '', channel: 'SMS', title: '', body: '' }); }}>Cancel</button>}
      </div>
    </form>

    <div className="table-panel" style={{ marginTop: 16 }}>
      <div className="section-toolbar"><strong>Templates</strong><span className="muted">{templates.length} shown</span></div>
      {loading ? (
        <div style={{ padding: 48, textAlign: 'center', color: 'var(--neutral-500)' }}>Loading…</div>
      ) : templates.length === 0 ? (
        <div style={{ padding: 48, textAlign: 'center', color: 'var(--neutral-500)' }}>No notification templates yet.</div>
      ) : (
        <div style={{ overflowX: 'auto' }}>
          <table className="data-table">
            <thead><tr><th>Key</th><th>Channel</th><th>Title</th><th>Body</th><th>Actions</th></tr></thead>
            <tbody>
              {templates.map((t) => (
                <tr key={t.id}>
                  <td style={{ fontFamily: 'monospace', fontSize: 12 }}>{t.key}</td>
                  <td>{t.channel}</td>
                  <td>{t.title || '—'}</td>
                  <td style={{ fontSize: 12, color: 'var(--neutral-400)', maxWidth: 320 }}>{t.body}</td>
                  <td style={{ display: 'flex', gap: 8 }}>
                    <button className="btn-secondary" style={{ fontSize: 12, padding: '4px 10px' }} onClick={() => edit(t)}>Edit</button>
                    <button className="btn-secondary" style={{ fontSize: 12, padding: '4px 10px', color: 'var(--red-500)' }} onClick={() => remove(t.id)}>Delete</button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  </div>;
}

function PartnerApiTab() {
  const [keys, setKeys] = useState<any[]>([]);
  const [partnerName, setPartnerName] = useState('');
  const [createdKey, setCreatedKey] = useState<string | null>(null);
  const [message, setMessage] = useState('');
  const [docs, setDocs] = useState<any>(null);
  const [requests, setRequests] = useState<any[]>([]);
  const [selectedKeyId, setSelectedKeyId] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  const load = () => {
    setLoading(true);
    Promise.all([partnerApi.listKeys(), partnerApi.docs()])
      .then(([keysRes, docsRes]) => {
        setKeys(keysRes.data || []);
        setDocs(docsRes.data || null);
      })
      .catch((err) => {
        setMessage(err?.response?.data?.message || 'Unable to load partner API settings.');
      })
      .finally(() => setLoading(false));
  };

  useEffect(() => {
    load();
  }, []);

  const create = async (event: FormEvent) => {
    event.preventDefault();
    setMessage('');
    setCreatedKey(null);
    try {
      const res = await partnerApi.createKey(partnerName.trim());
      setCreatedKey(res.data.apiKey);
      setPartnerName('');
      setMessage(res.data.warning || 'Key created.');
      load();
    } catch (err: any) {
      setMessage(err?.response?.data?.message || 'Unable to create key.');
    }
  };

  const revoke = async (id: string) => {
    try {
      await partnerApi.revokeKey(id);
      setMessage('Key revoked.');
      if (selectedKeyId === id) {
        setSelectedKeyId(null);
        setRequests([]);
      }
      load();
    } catch (err: any) {
      setMessage(err?.response?.data?.message || 'Unable to revoke key.');
    }
  };

  const showRequests = async (id: string) => {
    setSelectedKeyId(id);
    try {
      const res = await partnerApi.listRequests(id, 40);
      setRequests(res.data || []);
    } catch (err: any) {
      setMessage(err?.response?.data?.message || 'Unable to load audit requests.');
    }
  };

  return (
    <div>
      <form onSubmit={create} className="action-panel">
        <div className="panel-header">
          <div>
            <h2 className="panel-title">Partner API keys</h2>
            <p className="panel-copy">
              Issue X-API-Key credentials for banks. Credit profile schema{' '}
              <code>{docs?.schema || 'mayode.credit-profile.v1'}</code>. Docs:{' '}
              <code>GET /partner/v1/docs</code>.
            </p>
          </div>
        </div>
        {message && (
          <div
            className={`alert-box ${
              message.includes('Unable') ? 'alert-danger' : 'alert-success'
            }`}
          >
            {message}
          </div>
        )}
        {createdKey && (
          <div className="alert-box alert-success" style={{ fontFamily: 'monospace', wordBreak: 'break-all' }}>
            New key (copy now): {createdKey}
          </div>
        )}
        <div className="form-grid">
          <label className="form-label">
            Partner name
            <input
              className="input-field"
              required
              value={partnerName}
              onChange={(e) => setPartnerName(e.target.value)}
              placeholder="e.g. CRDB Pilot"
            />
          </label>
        </div>
        <button className="btn-primary" style={{ marginTop: 12 }}>
          Create API key
        </button>
      </form>

      <div className="table-panel">
        <div className="section-toolbar">
          <strong>Issued keys</strong>
          <span className="muted">{keys.length} total</span>
        </div>
        {loading ? (
          <div style={{ padding: 48, textAlign: 'center', color: 'var(--neutral-500)' }}>Loading…</div>
        ) : keys.length === 0 ? (
          <div style={{ padding: 48, textAlign: 'center', color: 'var(--neutral-500)' }}>
            No partner keys yet.
          </div>
        ) : (
          <div style={{ overflowX: 'auto' }}>
            <table className="data-table">
              <thead>
                <tr>
                  <th>Partner</th>
                  <th>Prefix</th>
                  <th>Status</th>
                  <th>Requests</th>
                  <th>Last used</th>
                  <th />
                </tr>
              </thead>
              <tbody>
                {keys.map((key) => (
                  <tr key={key.id}>
                    <td style={{ fontWeight: 600 }}>{key.partnerName}</td>
                    <td style={{ fontFamily: 'monospace', fontSize: 12 }}>{key.keyPrefix}</td>
                    <td>
                      <span className={`badge ${key.isActive ? 'badge-green' : 'badge-gray'}`}>
                        {key.isActive ? 'Active' : 'Revoked'}
                      </span>
                    </td>
                    <td>{key._count?.requests ?? 0}</td>
                    <td style={{ fontSize: 12, color: 'var(--neutral-500)' }}>
                      {key.lastUsedAt
                        ? new Date(key.lastUsedAt).toLocaleString('en-TZ')
                        : 'Never'}
                    </td>
                    <td style={{ display: 'flex', gap: 8 }}>
                      <button
                        type="button"
                        className="btn-secondary"
                        style={{ fontSize: 12, padding: '4px 10px' }}
                        onClick={() => void showRequests(key.id)}
                      >
                        Audit log
                      </button>
                      {key.isActive && (
                        <button
                          type="button"
                          className="btn-secondary"
                          style={{ fontSize: 12, padding: '4px 10px', color: 'var(--red-500)' }}
                          onClick={() => void revoke(key.id)}
                        >
                          Revoke
                        </button>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {selectedKeyId && (
        <div className="table-panel" style={{ marginTop: 16 }}>
          <div className="section-toolbar">
            <strong>Recent requests</strong>
            <span className="muted">{requests.length} shown</span>
          </div>
          {requests.length === 0 ? (
            <div style={{ padding: 24, color: 'var(--neutral-500)', fontSize: 13 }}>
              No requests recorded for this key yet.
            </div>
          ) : (
            <div style={{ overflowX: 'auto' }}>
              <table className="data-table">
                <thead>
                  <tr>
                    <th>When</th>
                    <th>Endpoint</th>
                    <th>Farmer</th>
                    <th>IP</th>
                    <th>Status</th>
                  </tr>
                </thead>
                <tbody>
                  {requests.map((row) => (
                    <tr key={row.id}>
                      <td style={{ fontSize: 12 }}>
                        {new Date(row.createdAt).toLocaleString('en-TZ')}
                      </td>
                      <td style={{ fontFamily: 'monospace', fontSize: 11 }}>{row.endpoint}</td>
                      <td style={{ fontFamily: 'monospace', fontSize: 11 }}>
                        {row.farmerId || '—'}
                      </td>
                      <td style={{ fontSize: 12 }}>{row.ipAddress || '—'}</td>
                      <td>
                        <span
                          className={`badge ${
                            row.responseCode < 400 ? 'badge-green' : 'badge-gold'
                          }`}
                        >
                          {row.responseCode}
                        </span>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
