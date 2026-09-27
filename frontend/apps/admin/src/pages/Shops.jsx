import { useEffect, useState } from 'react';
import api from '../api.js';
import { Loading, ErrorState, EmptyState } from '../components/States.jsx';
import { asArray, errMsg, formatDate, statusBadge } from '../utils.js';

const ownerName = (s) =>
  s.owner_name || s.ownerName || s.owner?.name || s.owner?.email || '—';

const shopOpen = (s) => s.is_open ?? s.isOpen ?? s.open ?? null;

export default function Shops() {
  const [search, setSearch] = useState('');
  const [shops, setShops] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  const load = async (q) => {
    setLoading(true);
    setError(null);
    try {
      const res = await api.get('/admin/shops', { params: q ? { search: q } : {} });
      setShops(asArray(res.data, ['shops']));
    } catch (err) {
      setError(errMsg(err, 'Could not load shops.'));
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    load('');
  }, []);

  const onSubmit = (e) => {
    e.preventDefault();
    load(search.trim());
  };

  const onClear = () => {
    setSearch('');
    load('');
  };

  return (
    <div className="page">
      <header className="page-header">
        <h1>Shops</h1>
        <p>All kirana stores on the platform</p>
      </header>

      <form className="filters" onSubmit={onSubmit}>
        <input
          className="filter-input"
          type="search"
          placeholder="Search by shop name, owner or address…"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
        />
        <button className="btn btn-primary" type="submit">
          Search
        </button>
        {search && (
          <button className="btn btn-outline" type="button" onClick={onClear}>
            Clear
          </button>
        )}
        {!loading && !error && (
          <span className="results-count">
            {shops.length} {shops.length === 1 ? 'shop' : 'shops'}
          </span>
        )}
      </form>

      {loading ? (
        <Loading message="Loading shops…" />
      ) : error ? (
        <ErrorState message={error} onRetry={() => load(search.trim())} />
      ) : shops.length === 0 ? (
        <EmptyState
          message={search ? `No shops match “${search}”.` : 'No shops on the platform yet.'}
        />
      ) : (
        <div className="table-wrap">
          <table className="table">
            <thead>
              <tr>
                <th>Shop</th>
                <th>Owner</th>
                <th>Address</th>
                <th>Status</th>
                <th>Created</th>
              </tr>
            </thead>
            <tbody>
              {shops.map((s, i) => {
                const open = shopOpen(s);
                return (
                  <tr key={s.id || s._id || i}>
                    <td>
                      <div className="cell-title">{s.name || 'Unnamed shop'}</div>
                      {(s.phone || s.category) && (
                        <div className="cell-sub">{s.phone || s.category}</div>
                      )}
                    </td>
                    <td>{ownerName(s)}</td>
                    <td>{s.address || '—'}</td>
                    <td>
                      {open === null ? (
                        '—'
                      ) : (
                        <span className={statusBadge(open ? 'open' : 'closed')}>
                          {open ? 'Open' : 'Closed'}
                        </span>
                      )}
                    </td>
                    <td>{formatDate(s.created_at || s.createdAt)}</td>
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
