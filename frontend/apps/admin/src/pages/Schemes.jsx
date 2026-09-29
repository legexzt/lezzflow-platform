import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import api from '../api.js';
import { useAuth } from '../AuthContext.jsx';
import { Loading, ErrorState, EmptyState } from '../components/States.jsx';
import { errMsg, formatDate } from '../utils.js';

function daysToExpiry(validTo) {
  if (!validTo) return null;
  const ms = new Date(validTo).getTime() - Date.now();
  return Math.ceil(ms / 86400000);
}

function statusBadge(scheme) {
  const days = daysToExpiry(scheme.valid_to);
  if (!scheme.is_active) return <span className="badge badge-grey">Inactive</span>;
  if (scheme.status === 'check') return <span className="badge badge-amber">Needs check</span>;
  if (days !== null && days < 0) return <span className="badge badge-red">Expired</span>;
  if (days !== null && days <= 30) return <span className="badge badge-amber">Expiring</span>;
  return <span className="badge badge-green">Active</span>;
}

export default function Schemes() {
  const { isOpsViewer } = useAuth();
  const [schemes, setSchemes] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [editing, setEditing] = useState(null);
  const [form, setForm] = useState({ apply_url: '', valid_to: '', status: 'active', is_active: true });
  const [saving, setSaving] = useState(false);

  const load = async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await api.get('/admin/schemes');
      const data = res.data;
      setSchemes(Array.isArray(data) ? data : data?.schemes ?? data?.data ?? []);
    } catch (err) {
      setError(errMsg(err, 'Could not load schemes.'));
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    load();
  }, []);

  const startEdit = (scheme) => {
    setEditing(scheme.id);
    setForm({
      apply_url: scheme.apply_url || '',
      valid_to: scheme.valid_to ? String(scheme.valid_to).slice(0, 10) : '',
      status: scheme.status || 'active',
      is_active: scheme.is_active !== false,
    });
  };

  const saveEdit = async (id) => {
    setSaving(true);
    try {
      await api.patch(`/admin/schemes/${id}`, {
        apply_url: form.apply_url || null,
        valid_to: form.valid_to || null,
        status: form.status,
        is_active: form.is_active,
      });
      setEditing(null);
      await load();
    } catch (err) {
      setError(errMsg(err, 'Could not save scheme.'));
    } finally {
      setSaving(false);
    }
  };

  const toggleActive = async (scheme) => {
    try {
      await api.patch(`/admin/schemes/${scheme.id}`, { is_active: !scheme.is_active });
      await load();
    } catch (err) {
      setError(errMsg(err, 'Could not update scheme.'));
    }
  };

  return (
    <div className="page">
      <header className="page-header">
        <h1>Sarkari Yojanaen</h1>
        <p>Curate government schemes shown in the Mart app — fix links, flag expiring ones</p>
      </header>

      {loading ? (
        <Loading message="Loading schemes…" />
      ) : error ? (
        <ErrorState message={error} onRetry={load} />
      ) : schemes.length === 0 ? (
        <EmptyState message="No schemes found." />
      ) : (
        <div className="table-wrap">
          <table className="table">
            <thead>
              <tr>
                <th>Scheme</th>
                <th>Category</th>
                <th>Status</th>
                <th>Valid till</th>
                <th>Apply link</th>
                <th>Actions</th>
              </tr>
            </thead>
            <tbody>
              {schemes.map((s) => {
                const days = daysToExpiry(s.valid_to);
                const isEditing = editing === s.id;
                return (
                  <tr key={s.id}>
                    <td>
                      <strong>{s.title}</strong>
                      {s.description && <div className="muted">{String(s.description).slice(0, 80)}</div>}
                    </td>
                    <td>{s.category || '—'}</td>
                    <td>{statusBadge(s)}</td>
                    <td>
                      {isEditing ? (
                        <input
                          className="input"
                          type="date"
                          value={form.valid_to}
                          onChange={(e) => setForm({ ...form, valid_to: e.target.value })}
                        />
                      ) : (
                        <>
                          {formatDate(s.valid_to)}
                          {days !== null && days >= 0 && days <= 30 && (
                            <div className="muted">expires in {days}d</div>
                          )}
                        </>
                      )}
                    </td>
                    <td>
                      {isEditing ? (
                        <input
                          className="input"
                          type="url"
                          placeholder="https://…"
                          value={form.apply_url}
                          onChange={(e) => setForm({ ...form, apply_url: e.target.value })}
                        />
                      ) : s.apply_url ? (
                        <a href={s.apply_url} target="_blank" rel="noreferrer">Open</a>
                      ) : (
                        '—'
                      )}
                    </td>
                    <td>
                      {isEditing ? (
                        <>
                          <select
                            className="input"
                            value={form.status}
                            onChange={(e) => setForm({ ...form, status: e.target.value })}
                          >
                            <option value="active">active</option>
                            <option value="check">check</option>
                          </select>
                          <label className="muted" style={{ display: 'block', marginTop: 4 }}>
                            <input
                              type="checkbox"
                              checked={form.is_active}
                              onChange={(e) => setForm({ ...form, is_active: e.target.checked })}
                            />{' '}
                            Visible
                          </label>
                          <div style={{ marginTop: 6, display: 'flex', gap: 6 }}>
                            <button className="btn btn-primary btn-sm" disabled={saving} onClick={() => saveEdit(s.id)} type="button">
                              Save
                            </button>
                            <button className="btn btn-outline btn-sm" onClick={() => setEditing(null)} type="button">
                              Cancel
                            </button>
                          </div>
                        </>
                      ) : (
                        <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
                          {!isOpsViewer && (
                            <button className="btn btn-outline btn-sm" onClick={() => startEdit(s)} type="button">
                              Edit
                            </button>
                          )}
                          {!isOpsViewer && (
                            <button className="btn btn-outline btn-sm" onClick={() => toggleActive(s)} type="button">
                              {s.is_active ? 'Hide' : 'Show'}
                            </button>
                          )}
                          <Link
                            className="btn btn-outline btn-sm"
                            to={`/notifications?featureScheme=${encodeURIComponent(s.id)}&schemeTitle=${encodeURIComponent(s.title)}`}
                          >
                            Feature in broadcast
                          </Link>
                        </div>
                      )}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
