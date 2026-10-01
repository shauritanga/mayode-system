'use client';
import { useEffect, useState } from 'react';
import { cropCyclesApi } from '@/lib/api';

interface ActivityLog {
  id: string;
  activityType: string;
  activityDate: string;
  description?: string;
  laborWorkers?: number;
  laborHours?: number;
  photoUrls?: string[];
  cropCycle?: { season: string; riceVariety?: string; farm?: { farmCode: string } };
  fieldOfficer?: { firstName: string; lastName: string; employeeCode?: string };
}

const ACTIVITY_TYPES = ['LAND_PREPARATION', 'PLANTING', 'FERTILIZING', 'WEEDING', 'PEST_CONTROL', 'IRRIGATION', 'HARVESTING', 'DRYING', 'STORAGE', 'TRANSPORT'];

export default function ActivitiesPage() {
  const [activities, setActivities] = useState<ActivityLog[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [typeFilter, setTypeFilter] = useState('');
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editForm, setEditForm] = useState({ activityType: '', activityDate: '', description: '' });
  const [message, setMessage] = useState('');

  const load = () => {
    setLoading(true);
    cropCyclesApi.activityLogs()
      .then((res) => setActivities(res.data || []))
      .catch(console.error)
      .finally(() => setLoading(false));
  };

  useEffect(() => { load(); }, []);

  const filtered = activities.filter((activity) => {
    if (typeFilter && activity.activityType !== typeFilter) return false;
    const haystack = `${activity.description || ''} ${activity.cropCycle?.season || ''} ${activity.cropCycle?.farm?.farmCode || ''} ${activity.fieldOfficer?.firstName || ''} ${activity.fieldOfficer?.lastName || ''}`.toLowerCase();
    return haystack.includes(search.toLowerCase());
  });

  const startEdit = (activity: ActivityLog) => {
    setEditingId(activity.id);
    setEditForm({
      activityType: activity.activityType,
      activityDate: activity.activityDate.slice(0, 10),
      description: activity.description || '',
    });
  };

  const saveEdit = async (id: string) => {
    setMessage('');
    try {
      await cropCyclesApi.updateActivityLog(id, {
        activityType: editForm.activityType,
        activityDate: new Date(editForm.activityDate).toISOString(),
        description: editForm.description,
      });
      setEditingId(null);
      setMessage('Activity updated.');
      load();
    } catch (err: any) {
      setMessage(err?.response?.data?.message || 'Update failed.');
    }
  };

  const remove = async (id: string) => {
    if (!confirm('Delete this activity record? This cannot be undone.')) return;
    setMessage('');
    try {
      await cropCyclesApi.deleteActivityLog(id);
      setMessage('Activity deleted.');
      load();
    } catch (err: any) {
      setMessage(err?.response?.data?.message || 'Delete failed.');
    }
  };

  return (
    <div>
      <div style={{ marginBottom: '28px', display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: '16px' }}>
        <div>
          <div style={{ display: 'flex', alignItems: 'center', gap: '10px', marginBottom: '4px' }}>
            <div style={{ width: '4px', height: '26px', background: 'linear-gradient(to bottom, var(--accent), var(--green-400))', borderRadius: '9999px' }} />
            <h1 style={{ fontFamily: 'Outfit, sans-serif', fontSize: '24px', fontWeight: 800, color: 'var(--text-primary)' }}>Crop Activities</h1>
          </div>
          <p style={{ fontSize: '13px', color: 'var(--neutral-500)', marginLeft: '14px' }}>Farm activity log records — view, edit and correct entries.</p>
        </div>
        <div style={{ display: 'flex', gap: '12px', alignItems: 'center' }}>
          <select className="input-field" style={{ width: '200px' }} value={typeFilter} onChange={(e) => setTypeFilter(e.target.value)}>
            <option value="">All activity types</option>
            {ACTIVITY_TYPES.map((type) => <option key={type} value={type}>{type.replace(/_/g, ' ')}</option>)}
          </select>
          <input
            type="search"
            placeholder="Search description, season, farm code, officer…"
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
          <div style={{ padding: '48px', textAlign: 'center', color: 'var(--neutral-500)', fontSize: '14px' }}>Loading activities…</div>
        ) : filtered.length === 0 ? (
          <div style={{ padding: '48px', textAlign: 'center', color: 'var(--neutral-500)', fontSize: '14px' }}>
            {search || typeFilter ? 'No activities match your filters.' : 'No activity records yet.'}
          </div>
        ) : (
          <div style={{ overflowX: 'auto' }}>
            <table className="data-table">
              <thead>
                <tr>
                  <th>Date</th>
                  <th>Activity</th>
                  <th>Farm / Season</th>
                  <th>Field officer</th>
                  <th>Description</th>
                  <th>Actions</th>
                </tr>
              </thead>
              <tbody>
                {filtered.map((activity) => (
                  <tr key={activity.id}>
                    {editingId === activity.id ? (
                      <>
                        <td><input className="input-field" type="date" value={editForm.activityDate} onChange={(e) => setEditForm({ ...editForm, activityDate: e.target.value })} /></td>
                        <td>
                          <select className="input-field" value={editForm.activityType} onChange={(e) => setEditForm({ ...editForm, activityType: e.target.value })}>
                            {ACTIVITY_TYPES.map((type) => <option key={type} value={type}>{type.replace(/_/g, ' ')}</option>)}
                          </select>
                        </td>
                        <td style={{ color: 'var(--neutral-400)', fontSize: '12px' }}>{activity.cropCycle?.farm?.farmCode || '—'} · {activity.cropCycle?.season || '—'}</td>
                        <td style={{ color: 'var(--neutral-400)', fontSize: '12px' }}>{activity.fieldOfficer ? `${activity.fieldOfficer.firstName} ${activity.fieldOfficer.lastName}` : '—'}</td>
                        <td><input className="input-field" value={editForm.description} onChange={(e) => setEditForm({ ...editForm, description: e.target.value })} /></td>
                        <td style={{ display: 'flex', gap: 8 }}>
                          <button className="btn-primary" style={{ fontSize: '12px', padding: '4px 10px' }} onClick={() => saveEdit(activity.id)}>Save</button>
                          <button className="btn-secondary" style={{ fontSize: '12px', padding: '4px 10px' }} onClick={() => setEditingId(null)}>Cancel</button>
                        </td>
                      </>
                    ) : (
                      <>
                        <td style={{ fontSize: '12px', color: 'var(--neutral-400)' }}>{new Date(activity.activityDate).toLocaleDateString()}</td>
                        <td style={{ fontWeight: 600, color: 'var(--text-primary)' }}>{activity.activityType.replace(/_/g, ' ')}</td>
                        <td style={{ color: 'var(--neutral-400)', fontSize: '12px' }}>{activity.cropCycle?.farm?.farmCode || '—'} · {activity.cropCycle?.season || '—'}</td>
                        <td style={{ color: 'var(--neutral-400)', fontSize: '12px' }}>{activity.fieldOfficer ? `${activity.fieldOfficer.firstName} ${activity.fieldOfficer.lastName}` : '—'}</td>
                        <td style={{ color: 'var(--neutral-400)', fontSize: '12px', maxWidth: 260 }}>{activity.description || '—'}</td>
                        <td style={{ display: 'flex', gap: 8 }}>
                          <button className="btn-secondary" style={{ fontSize: '12px', padding: '4px 10px' }} onClick={() => startEdit(activity)}>Edit</button>
                          <button className="btn-secondary" style={{ fontSize: '12px', padding: '4px 10px', color: 'var(--red-500)' }} onClick={() => remove(activity.id)}>Delete</button>
                        </td>
                      </>
                    )}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      <div style={{ marginTop: '14px', fontSize: '12px', color: 'var(--neutral-600)' }}>
        Showing {filtered.length} of {activities.length} activity records
      </div>
    </div>
  );
}
