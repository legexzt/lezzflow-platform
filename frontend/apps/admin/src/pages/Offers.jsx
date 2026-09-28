import { useEffect, useState } from 'react';
import api from '../api.js';
import { Loading, ErrorState, EmptyState } from '../components/States.jsx';
import { errMsg, formatDate } from '../utils.js';

function computeFlags(offer) {
  const flags = [];
  if (offer.discount_type === 'percent' && offer.discount_value >= 70) {
    flags.push('High discount');
  }
  if (offer.valid_from && offer.valid_to) {
    const days = (new Date(offer.valid_to) - new Date(offer.valid_from)) / 86400000;
    if (days > 30) flags.push('Long validity');
  }
  if (offer.active === false) {
    flags.push('Inactive');
  }
  return flags;
}

function renderDiscount(offer) {
  if (offer.discount_type === 'percent') return `${offer.discount_value}%`;
  if (offer.discount_type === 'flat') return `\u20b9${offer.discount_value}`;
  return offer.discount_value ?? '—';
}

function renderMinOrder(offer) {
  if (!offer.min_order) return 'None';
  return `\u20b9${offer.min_order}`;
}

function renderValidity(offer) {
  if (!offer.valid_from && !offer.valid_to) return '—';
  return `${formatDate(offer.valid_from)} – ${formatDate(offer.valid_to)}`;
}

export default function Offers() {
  const [offers, setOffers] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  const load = async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await api.get('/admin/offers');
      const data = res.data;
      setOffers(Array.isArray(data) ? data : data?.offers ?? data?.data ?? []);
    } catch (err) {
      setError(errMsg(err, 'Could not load offers.'));
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    load();
  }, []);

  return (
    <div className="page">
      <header className="page-header">
        <h1>Offers</h1>
        <p>Discount offers configured by sellers — read-only</p>
      </header>

      {loading ? (
        <Loading message="Loading offers…" />
      ) : error ? (
        <ErrorState message={error} onRetry={load} />
      ) : offers.length === 0 ? (
        <EmptyState message="No offers found." />
      ) : (
        <div className="table-wrap">
          <table className="table">
            <thead>
              <tr>
                <th>Shop</th>
                <th>Title</th>
                <th>Discount</th>
                <th>Min order</th>
                <th>Validity</th>
                <th>Active</th>
                <th>Flags</th>
              </tr>
            </thead>
            <tbody>
              {offers.map((offer) => {
                const flags = computeFlags(offer);
                return (
                  <tr key={offer.id}>
                    <td>{offer.shop_name || offer.shop_id || '—'}</td>
                    <td>{offer.title || '—'}</td>
                    <td>{renderDiscount(offer)}</td>
                    <td>{renderMinOrder(offer)}</td>
                    <td style={{ whiteSpace: 'nowrap' }}>{renderValidity(offer)}</td>
                    <td>{offer.active ? 'Yes' : 'No'}</td>
                    <td>
                      {flags.length === 0
                        ? '—'
                        : flags.map((f) => (
                            <span key={f} className="badge badge-amber" style={{ marginRight: 4 }}>
                              {f}
                            </span>
                          ))}
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
