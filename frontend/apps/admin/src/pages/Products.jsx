import { useEffect, useState } from 'react';
import api from '../api.js';
import { Loading, ErrorState, EmptyState } from '../components/States.jsx';
import { asArray, errMsg, formatMoney } from '../utils.js';

const stockOf = (p) => {
  const v = p.stock ?? p.quantity ?? p.in_stock ?? p.inStock;
  if (v === null || v === undefined) return '—';
  if (typeof v === 'boolean') return v ? 'In stock' : 'Out of stock';
  return String(v);
};

const imageOf = (p) => p.image || p.image_url || p.imageUrl || null;

export default function Products() {
  const [shops, setShops] = useState([]);
  const [shopId, setShopId] = useState('');
  const [shopsNote, setShopsNote] = useState(null);
  const [products, setProducts] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  useEffect(() => {
    (async () => {
      try {
        const res = await api.get('/admin/shops');
        setShops(asArray(res.data, ['shops']));
      } catch {
        setShopsNote('Could not load the shop list — showing all products.');
      }
    })();
  }, []);

  const load = async (id) => {
    setLoading(true);
    setError(null);
    try {
      const res = await api.get('/admin/products', { params: id ? { shopId: id } : {} });
      setProducts(asArray(res.data, ['products']));
    } catch (err) {
      setError(errMsg(err, 'Could not load products.'));
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    load('');
  }, []);

  const onFilter = (e) => {
    const id = e.target.value;
    setShopId(id);
    load(id);
  };

  const shopNameFor = (p) => {
    if (p.shop_name || p.shopName || p.shop?.name) {
      return p.shop_name || p.shopName || p.shop?.name;
    }
    const pid = p.shop_id || p.shopId;
    const match = shops.find((s) => (s.id || s._id) === pid);
    return match?.name || '—';
  };

  return (
    <div className="page">
      <header className="page-header">
        <h1>Products</h1>
        <p>Catalogue across all shops</p>
      </header>

      <div className="filters">
        <select className="filter-select" value={shopId} onChange={onFilter}>
          <option value="">All shops</option>
          {shops.map((s) => (
            <option key={s.id || s._id} value={s.id || s._id}>
              {s.name || `Shop ${s.id || s._id}`}
            </option>
          ))}
        </select>
        {shopsNote && <span className="cell-sub">{shopsNote}</span>}
        {!loading && !error && (
          <span className="results-count">
            {products.length} {products.length === 1 ? 'product' : 'products'}
          </span>
        )}
      </div>

      {loading ? (
        <Loading message="Loading products…" />
      ) : error ? (
        <ErrorState message={error} onRetry={() => load(shopId)} />
      ) : products.length === 0 ? (
        <EmptyState message={shopId ? 'This shop has no products yet.' : 'No products yet.'} />
      ) : (
        <div className="table-wrap">
          <table className="table">
            <thead>
              <tr>
                <th>Product</th>
                <th>Category</th>
                <th>Price</th>
                <th>Stock</th>
                <th>Shop</th>
              </tr>
            </thead>
            <tbody>
              {products.map((p, i) => {
                const img = imageOf(p);
                return (
                  <tr key={p.id || p._id || i}>
                    <td>
                      <div className="cell-main">
                        {img && (
                          <img
                            className="thumb"
                            src={img}
                            alt=""
                            onError={(e) => {
                              e.currentTarget.style.display = 'none';
                            }}
                          />
                        )}
                        <div>
                          <div className="cell-title">{p.name || 'Unnamed product'}</div>
                          {p.brand && <div className="cell-sub">{p.brand}</div>}
                        </div>
                      </div>
                    </td>
                    <td>{p.category || '—'}</td>
                    <td>{formatMoney(p.price ?? p.mrp)}</td>
                    <td>{stockOf(p)}</td>
                    <td>{shopNameFor(p)}</td>
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
