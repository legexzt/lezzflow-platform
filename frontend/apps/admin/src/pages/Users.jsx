import { useEffect, useState } from 'react';
import api from '../api.js';
import { Loading, ErrorState, EmptyState } from '../components/States.jsx';
import { asArray, errMsg, formatDate, roleBadge } from '../utils.js';

const ROLES = ['customer', 'seller', 'partner', 'admin'];

export default function Users() {
  const [role, setRole] = useState('');
  const [users, setUsers] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  const load = async (r) => {
    setLoading(true);
    setError(null);
    try {
      const res = await api.get('/admin/users', { params: r ? { role: r } : {} });
      setUsers(asArray(res.data, ['users']));
    } catch (err) {
      setError(errMsg(err, 'Could not load users.'));
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    load('');
  }, []);

  const onFilter = (e) => {
    const r = e.target.value;
    setRole(r);
    load(r);
  };

  return (
    <div className="page">
      <header className="page-header">
        <h1>Users</h1>
        <p>Customers, sellers, delivery partners and admins</p>
      </header>

      <div className="filters">
        <select className="filter-select" value={role} onChange={onFilter}>
          <option value="">All roles</option>
          {ROLES.map((r) => (
            <option key={r} value={r}>
              {r.charAt(0).toUpperCase() + r.slice(1)}s
            </option>
          ))}
        </select>
        {!loading && !error && (
          <span className="results-count">
            {users.length} {users.length === 1 ? 'user' : 'users'}
          </span>
        )}
      </div>

      {loading ? (
        <Loading message="Loading users…" />
      ) : error ? (
        <ErrorState message={error} onRetry={() => load(role)} />
      ) : users.length === 0 ? (
        <EmptyState message={role ? `No users with role “${role}”.` : 'No users yet.'} />
      ) : (
        <div className="table-wrap">
          <table className="table">
            <thead>
              <tr>
                <th>Name</th>
                <th>Email</th>
                <th>Phone</th>
                <th>Role</th>
                <th>Joined</th>
              </tr>
            </thead>
            <tbody>
              {users.map((u, i) => (
                <tr key={u.id || u._id || u.uid || i}>
                  <td>
                    <div className="cell-title">{u.name || u.displayName || '—'}</div>
                  </td>
                  <td>{u.email || '—'}</td>
                  <td>{u.phone || u.phone_number || u.phoneNumber || '—'}</td>
                  <td>
                    {u.role ? <span className={roleBadge(u.role)}>{u.role}</span> : '—'}
                  </td>
                  <td>{formatDate(u.created_at || u.createdAt)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
