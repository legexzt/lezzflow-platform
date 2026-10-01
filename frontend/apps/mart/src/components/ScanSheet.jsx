import { useEffect, useState } from 'react';
import api from '../api';
import { useCart } from '../CartContext.jsx';
import Icon from './Icon.jsx';
import { formatPrice } from '../shopUtils';

function asArray(data, key) {
  if (Array.isArray(data)) return data;
  if (data && Array.isArray(data[key])) return data[key];
  return [];
}

/** Leading integer from quantities like "2 kg" or "3"; defaults to 1. */
function parseQty(qty) {
  const match = String(qty ?? '').trim().match(/^(\d+)/);
  const n = match ? parseInt(match[1], 10) : 1;
  return Number.isFinite(n) && n > 0 ? n : 1;
}

function shopLabel(product) {
  return product.shop_name || product.shop?.name || '';
}

/**
 * Bottom sheet shown after scanning a handwritten shopping list. Each
 * detected item is matched against the catalog once on mount; the customer
 * reviews matches and quantities, then adds everything in one tap.
 */
export default function ScanSheet({ items, onClose }) {
  const { addItem, setQuantity } = useCart();
  const [rows, setRows] = useState(() =>
    (Array.isArray(items) ? items : []).map((it) => ({
      item: it.item,
      qty: parseQty(it.qty),
      checked: true,
      match: null,
      loading: true,
    }))
  );

  // Match every detected item against the catalog (first hit wins).
  useEffect(() => {
    let cancelled = false;
    const list = Array.isArray(items) ? items : [];
    (async () => {
      const matches = await Promise.all(
        list.map(async (it) => {
          try {
            const res = await api.get('/api/products', {
              params: { search: it.item, limit: 3 },
            });
            return asArray(res.data, 'data')[0] || null;
          } catch {
            return null;
          }
        })
      );
      if (!cancelled) {
        setRows((prev) =>
          prev.map((row, i) => ({ ...row, match: matches[i] ?? null, loading: false }))
        );
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [items]);

  const toggleRow = (idx) =>
    setRows((prev) =>
      prev.map((row, i) => (i === idx ? { ...row, checked: !row.checked } : row))
    );

  const bumpQty = (idx, delta) =>
    setRows((prev) =>
      prev.map((row, i) =>
        i === idx ? { ...row, qty: Math.max(1, row.qty + delta) } : row
      )
    );

  const handleAddAll = () => {
    for (const row of rows) {
      if (!row.checked || !row.match) continue;
      const product = row.match;
      addItem(product, { id: product.shop_id, name: shopLabel(product) });
      setQuantity(product.id, row.qty);
    }
    onClose();
  };

  const addable = rows.some((row) => row.checked && row.match);

  return (
    <div className="scan-overlay" onClick={onClose}>
      <div className="scan-sheet" onClick={(e) => e.stopPropagation()}>
        <div className="scan-sheet-head">
          <h3>Scanned list</h3>
          <button type="button" className="icon-btn" onClick={onClose} aria-label="Close">
            <Icon name="close" size={18} />
          </button>
        </div>

        {rows.length === 0 ? (
          <p className="muted">No items detected in that photo.</p>
        ) : (
          <ul className="scan-list">
            {rows.map((row, idx) => (
              <li key={`${row.item}-${idx}`} className="scan-row">
                <input
                  type="checkbox"
                  checked={row.checked}
                  onChange={() => toggleRow(idx)}
                  aria-label={`Include ${row.item}`}
                />
                <div className="scan-row-info">
                  <strong>{row.item}</strong>
                  {row.loading ? (
                    <span className="muted small">Finding a match…</span>
                  ) : row.match ? (
                    <span className="muted small">
                      {row.match.name}
                      {shopLabel(row.match) ? ` · ${shopLabel(row.match)}` : ''} ·{' '}
                      {formatPrice(row.match.price)}
                    </span>
                  ) : (
                    <span className="muted small">No match found</span>
                  )}
                </div>
                <div className="qty-stepper">
                  <button
                    type="button"
                    className="btn btn-outline btn-sm"
                    onClick={() => bumpQty(idx, -1)}
                    aria-label="Decrease quantity"
                  >
                    −
                  </button>
                  <span className="qty">{row.qty}</span>
                  <button
                    type="button"
                    className="btn btn-outline btn-sm"
                    onClick={() => bumpQty(idx, 1)}
                    aria-label="Increase quantity"
                  >
                    +
                  </button>
                </div>
              </li>
            ))}
          </ul>
        )}

        <button
          type="button"
          className="btn btn-primary btn-block"
          onClick={handleAddAll}
          disabled={!addable}
        >
          Add all to cart
        </button>
      </div>
    </div>
  );
}
