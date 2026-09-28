import { Fragment, useEffect, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import api from '../api.js';
import { Loading, ErrorState, EmptyState } from '../components/States.jsx';
import {
  asArray,
  errMsg,
  formatDate,
  formatDateTime,
  statusBadge,
  prettify,
  REJECT_REASON_LABELS,
} from '../utils.js';

const ownerName = (s) =>
  s.owner_name || s.ownerName || s.owner?.name || s.owner?.email || s.seller?.name || '—';

const shopOpen = (s) => s.is_open ?? s.isOpen ?? s.open ?? null;

const ACTION_LABELS = {
  kyc_approve: 'KYC approved',
  kyc_reject: 'KYC rejected',
  kyc_reupload_requested: 'Re-upload requested',
  order_nudge: 'Order nudge sent',
  ops_viewer_granted: 'Ops viewer granted',
  ops_viewer_revoked: 'Ops viewer revoked',
};

function formatAction(action) {
  return ACTION_LABELS[action] || prettify(action);
}

function renderAuditDetails(details) {
  if (!details) return null;
  const parts = [];
  const reason = details.reason_code;
  if (reason) {
    const reasonLabel = REJECT_REASON_LABELS[reason] || reason;
    parts.push(`Reason: ${reasonLabel}`);
  }
  const note = details.note || details.reject_note;
  if (note) {
    parts.push(`Note: ${note}`);
  }
  if (details.target) {
    parts.push(`Target: ${details.target}`);
  }
  if (parts.length === 0) return null;
  return parts.join(' · ');
}

export default function Shops() {
  const [searchParams, setSearchParams] = useSearchParams();
  const emptyParam = searchParams.get('empty') || '';

  const [search, setSearch] = useState('');
  const [shops, setShops] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  // History panel state
  const [expandedShopId, setExpandedShopId] = useState(null);
  const [history, setHistory] = useState([]);
  const [historyLoading, setHistoryLoading] = useState(false);
  const [historyError, setHistoryError] = useState(null);

  const load = async (q) => {
    setLoading(true);
    setError(null);
    try {
      if (emptyParam === '1') {
        const [shopsRes, productsRes] = await Promise.all([
          api.get('/admin/shops', { params: { limit: 100 } }),
          api.get('/admin/products', { params: { limit: 100 } }),
        ]);
        const allShops = asArray(shopsRes.data, ['shops']);
        const allProducts = asArray(productsRes.data, ['products']);
        const productShopIds = new Set(
          allProducts.map((p) => p.shop_id || p.shop?.id).filter(Boolean)
        );
        const emptyShops = allShops.filter((s) => !productShopIds.has(s.id));
        setShops(emptyShops);
      } else {
        const res = await api.get('/admin/shops', { params: q ? { search: q } : {} });
        setShops(asArray(res.data, ['shops']));
      }
    } catch (err) {
      setError(errMsg(err, 'Could not load shops.'));
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    load(search.trim());
  }, [emptyParam]);

  const onSubmit = (e) => {
    e.preventDefault();
    if (emptyParam) setSearchParams({});
    load(search.trim());
  };

  const onClear = () => {
    setSearch('');
    if (emptyParam) setSearchParams({});
    load('');
  };

  const clearEmptyFilter = () => {
    setSearchParams({});
  };

  const toggleHistory = async (shopId) => {
    if (expandedShopId === shopId) {
      setExpandedShopId(null);
      setHistory([]);
      return;
    }

    setExpandedShopId(shopId);
    setHistoryLoading(true);
    setHistoryError(null);
    setHistory([]);

    try {
      const res = await api.get('/admin/audit', {
        params: { entity_type: 'shop', entity_id: shopId },
      });
      setHistory(asArray(res.data, ['data', 'audit']));
    } catch (err) {
      setHistoryError(errMsg(err, 'Could not load audit history.'));
    } finally {
      setHistoryLoading(false);
    }
  };

  return (
    <div className="page">
      <header className="page-header">
        <h1>Shops</h1>
        <p>All kirana stores on the platform</p>
      </header>

      {emptyParam === '1' && (
        <div
          className="alert alert-info"
          style={{
            marginBottom: 16,
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'center',
          }}
        >
          <span>Showing shops with no products listed.</span>
          <button className="btn btn-outline btn-sm" type="button" onClick={clearEmptyFilter}>
            Show all shops
          </button>
        </div>
      )}

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
            {shops.length}{' '}{shops.length === 1 ? 'shop' : 'shops'}
          </span>
        )}
      </form>

      {loading ? (
        <Loading message="Loading shops…" />
      ) : error ? (
        <ErrorState message={error} onRetry={() => load(search.trim())} />
      ) : shops.length === 0 ? (
        <EmptyState
          message={
            emptyParam === '1'
              ? 'No shops with zero products found.'
              : search
              ? `No shops match “${search}”.`
              : 'No shops on the platform yet.'
          }
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
                <th>Actions</th>
              </tr>
            </thead>
            <tbody>
              {shops.map((s, i) => {
                const shopId = s.id || s._id || i;
                const open = shopOpen(s);
                const isExpanded = expandedShopId === shopId;

                return (
                  <Fragment key={shopId}>
                    <tr>
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
                      <td>
                        <button
                          className="btn btn-sm btn-outline"
                          type="button"
                          onClick={() => toggleHistory(shopId)}
                        >
                          {isExpanded ? 'Hide' : 'History'}
                        </button>
                      </td>
                    </tr>
                    {isExpanded && (
                      <tr>
                        <td colSpan={6} style={{ padding: '12px 16px', background: '#f8fafc' }}>
                          <div className="history-panel">
                            <h4
                              style={{
                                margin: '0 0 8px',
                                fontSize: 13,
                                color: 'var(--muted)',
                              }}
                            >
                              Audit History for {s.name || 'Shop'}
                            </h4>
                            {historyLoading ? (
                              <Loading message="Loading history…" />
                            ) : historyError ? (
                              <p className="alert alert-error" style={{ margin: 0 }}>
                                {historyError}
                              </p>
                            ) : history.length === 0 ? (
                              <p style={{ margin: 0, color: 'var(--muted)', fontSize: 13 }}>
                                No recorded admin actions yet.
                              </p>
                            ) : (
                              <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                                {history.map((entry) => (
                                  <div className="history-entry" key={entry.id}>
                                    <span className="history-time">
                                      {formatDateTime(entry.created_at)}
                                    </span>
                                    <span className="history-actor">
                                      {entry.actor_name || 'Unknown admin'}
                                    </span>
                                    <span className="history-action">
                                      {formatAction(entry.action)}
                                    </span>
                                    {renderAuditDetails(entry.details) && (
                                      <span className="history-detail">
                                        {renderAuditDetails(entry.details)}
                                      </span>
                                    )}
                                  </div>
                                ))}
                              </div>
                            )}
                          </div>
                        </td>
                      </tr>
                    )}
                  </Fragment>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
