import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import api from '../api';
import { formatDistance, formatPrice, getCustomerPosition } from '../shopUtils';
import Icon from './Icon.jsx';

/**
 * "Compare nearby" bottom sheet: shows the SAME product stocked at other
 * nearby open, live shops with real prices and real distances.
 * One tap away from the product card — never the default browsing view.
 */
export default function CompareSheet({ productName, shopId, onClose }) {
  const navigate = useNavigate();
  const [loading, setLoading] = useState(true);
  const [options, setOptions] = useState([]);
  const [error, setError] = useState('');

  useEffect(() => {
    let mounted = true;
    setLoading(true);
    setError('');
    getCustomerPosition()
      .then((pos) => {
        if (!mounted) return;
        if (!pos) {
          setError('We need your location to compare nearby shops.');
          setLoading(false);
          return;
        }
        return api
          .get('/api/v1/products/compare', {
            params: { shop_id: shopId, name: productName, lat: pos.lat, lng: pos.lng },
          })
          .then((res) => {
            if (!mounted) return;
            setOptions(Array.isArray(res.data) ? res.data : []);
            setLoading(false);
          });
      })
      .catch(() => {
        if (mounted) {
          setError('Could not load nearby prices. Please try again.');
          setLoading(false);
        }
      });
    return () => {
      mounted = false;
    };
  }, [productName, shopId]);

  return (
    <div className="sheet-backdrop" onClick={onClose}>
      <div className="sheet" onClick={(e) => e.stopPropagation()} role="dialog" aria-label="Compare nearby prices">
        <div className="sheet-head">
          <h3>Compare nearby</h3>
          <button type="button" className="icon-btn" onClick={onClose} aria-label="Close">
            <Icon name="close" size={20} />
          </button>
        </div>
        <p className="muted sheet-sub">{productName} — same item at nearby shops</p>

        {loading ? (
          <div className="center-screen">
            <div className="spinner" />
            <p>Finding nearby prices…</p>
          </div>
        ) : error ? (
          <div className="banner banner-error">{error}</div>
        ) : options.length === 0 ? (
          <p className="muted">No other nearby shop stocks this item right now.</p>
        ) : (
          <ul className="compare-list">
            {options.map((opt) => (
              <li key={`${opt.shop_id}-${opt.product_id}`} className="compare-row">
                <div className="compare-info">
                  <strong>{opt.shop_name}</strong>
                  <span className="muted">
                    {formatDistance({ distance_km: opt.distance_km }) || 'nearby'} away
                  </span>
                </div>
                <span className="price">{formatPrice(opt.price)}</span>
                <button
                  type="button"
                  className="btn btn-outline btn-sm"
                  onClick={() => {
                    onClose();
                    navigate(`/shops/${opt.shop_id}`);
                  }}
                >
                  View shop
                </button>
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}
