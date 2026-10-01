import { useEffect, useMemo, useRef, useState } from 'react';
import api from '../api';
import { useCart } from '../CartContext.jsx';
import Icon from '../components/Icon.jsx';
import ScanSheet from '../components/ScanSheet.jsx';
import { formatPrice } from '../shopUtils';

const AVATAR_COLORS = ['#16a34a', '#2563eb', '#d97706', '#dc2626', '#7c3aed', '#0891b2'];

/** Deterministic avatar color from a shop id/name. */
function avatarColor(key) {
  const s = String(key ?? '');
  let h = 0;
  for (let i = 0; i < s.length; i++) h = (h * 31 + s.charCodeAt(i)) >>> 0;
  return AVATAR_COLORS[h % AVATAR_COLORS.length];
}

function asArray(data, key) {
  if (Array.isArray(data)) return data;
  if (data && Array.isArray(data[key])) return data[key];
  return [];
}

function ProductCard({ product, shopName, onAdd }) {
  const [imgOk, setImgOk] = useState(Boolean(product.image_url));
  return (
    <div className="product-card">
      {imgOk && (
        <img
          src={product.image_url}
          alt={product.name}
          className="product-image"
          loading="lazy"
          onError={() => setImgOk(false)}
        />
      )}
      <div className="product-body">
        <h3>{product.name}</h3>
        {shopName && <span className="muted small">{shopName}</span>}
        <div className="product-footer">
          <span className="price">{formatPrice(product.price)}</span>
          <button type="button" className="btn btn-primary btn-sm" onClick={onAdd}>
            Add
          </button>
        </div>
      </div>
    </div>
  );
}

function ShopAvatar({ shop }) {
  const hasPhoto = Boolean(shop.photo_url && String(shop.photo_url).trim());
  const [imgOk, setImgOk] = useState(hasPhoto);
  return (
    <span
      className="shop-avatar-circle"
      style={{ background: avatarColor(shop.id ?? shop.name) }}
    >
      {imgOk ? (
        <img
          src={shop.photo_url}
          alt={shop.name}
          style={{
            display: 'block',
            width: '100%',
            height: '100%',
            objectFit: 'cover',
            borderRadius: '50%',
          }}
          loading="lazy"
          onError={() => setImgOk(false)}
        />
      ) : (
        (shop.name || '?').trim().charAt(0).toUpperCase()
      )}
    </span>
  );
}

export default function Home() {
  const { addItem } = useCart();
  const [products, setProducts] = useState([]);
  const [shops, setShops] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [query, setQuery] = useState('');
  const [searchResults, setSearchResults] = useState(null); // null = no active server search
  const [category, setCategory] = useState('All');
  const [shopFilter, setShopFilter] = useState(null); // shop id, or null = all shops
  const [scanning, setScanning] = useState(false);
  const [scanError, setScanError] = useState('');
  const [scanItems, setScanItems] = useState(null); // null = sheet closed
  const fileRef = useRef(null);

  // Blinkit-style grocery home: products + shops up front, no map.
  // Map-based discovery lives on at /nearby.
  useEffect(() => {
    let mounted = true;
    setLoading(true);
    setError('');
    Promise.all([
      api.get('/api/products', { params: { limit: 100 } }),
      api.get('/api/shops'),
    ])
      .then(([prodRes, shopRes]) => {
        if (!mounted) return;
        setProducts(asArray(prodRes.data, 'data'));
        setShops(asArray(shopRes.data, 'shops'));
      })
      .catch((e) => {
        if (mounted) {
          setError(e.response?.data?.error || 'Could not load products. Please try again.');
        }
      })
      .finally(() => {
        if (mounted) setLoading(false);
      });
    return () => {
      mounted = false;
    };
  }, []);

  // Server-side search: the initial load only has the first 100 products, so
  // debounce the query and let the backend search the full catalog.
  useEffect(() => {
    const q = query.trim();
    if (!q) {
      setSearchResults(null);
      return undefined;
    }
    let stale = false;
    const timer = setTimeout(() => {
      api
        .get('/api/products', { params: { search: q, limit: 100 } })
        .then((res) => {
          if (!stale) setSearchResults(asArray(res.data, 'data'));
        })
        .catch(() => {
          // Search failed — leave the current list in place.
        });
    }, 400);
    return () => {
      stale = true;
      clearTimeout(timer);
    };
  }, [query]);

  const shopNames = useMemo(() => {
    const map = new Map();
    for (const shop of shops) map.set(String(shop.id), shop.name);
    return map;
  }, [shops]);

  // 'All' first, then each distinct category in first-seen order.
  const categories = useMemo(() => {
    const seen = [];
    for (const p of products) {
      if (p.category && !seen.includes(p.category)) seen.push(p.category);
    }
    return ['All', ...seen];
  }, [products]);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    // searchResults come pre-filtered by the backend; only the category and
    // shop chips apply on top of them.
    const pool = searchResults ?? products;
    return pool.filter((p) => {
      if (q && searchResults === null && !(p.name || '').toLowerCase().includes(q)) return false;
      if (category !== 'All' && p.category !== category) return false;
      if (shopFilter !== null && String(p.shop_id) !== String(shopFilter)) return false;
      return true;
    });
  }, [products, searchResults, query, category, shopFilter]);

  const sections = useMemo(() => {
    const groups = new Map();
    for (const p of filtered) {
      const cat = p.category || 'Other';
      if (!groups.has(cat)) groups.set(cat, []);
      groups.get(cat).push(p);
    }
    return [...groups.entries()];
  }, [filtered]);

  /** Photo of a handwritten list → server scan → review sheet. */
  const handleScanFile = async (e) => {
    const file = e.target.files?.[0];
    e.target.value = ''; // allow picking the same photo again
    if (!file) return;
    setScanning(true);
    setScanError('');
    try {
      const form = new FormData();
      form.append('image', file);
      const res = await api.post('/api/scan/list', form, {
        headers: { 'Content-Type': 'multipart/form-data' },
      });
      setScanItems(asArray(res.data, 'items'));
    } catch (err) {
      setScanError(
        err.response?.data?.error || 'Could not scan that photo. Please try again.'
      );
    } finally {
      setScanning(false);
    }
  };

  return (
    <div className="page">
      <div className="search-bar">
        <input
          type="text"
          className="input search-input"
          placeholder="Search for atta, milk, rice…"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
        />
        <button
          type="button"
          className="search-cam-btn"
          onClick={() => fileRef.current?.click()}
          disabled={scanning}
          aria-label="Scan a shopping list photo"
        >
          {scanning ? (
            <span className="spinner spinner-sm" />
          ) : (
            <Icon name="camera" size={20} />
          )}
        </button>
        <input
          ref={fileRef}
          type="file"
          accept="image/*"
          capture="environment"
          style={{ display: 'none' }}
          onChange={handleScanFile}
        />
      </div>

      {scanError && <div className="banner banner-error">{scanError}</div>}
      {error && <div className="banner banner-error">{error}</div>}

      {categories.length > 1 && (
        <div className="chip-row-scroll">
          {categories.map((c) => (
            <button
              key={c}
              type="button"
              className={`cat-chip${category === c ? ' active' : ''}`}
              onClick={() => setCategory(c)}
            >
              {c}
            </button>
          ))}
        </div>
      )}

      <section className="shop-avatar-section">
        <h2>Shops near you</h2>
        {shops.length === 0 && !loading ? (
          <p className="muted">No shops yet.</p>
        ) : (
          <div className="shop-avatar-row">
            {shops.map((shop) => (
              <button
                key={shop.id}
                type="button"
                className={`shop-avatar${shopFilter === shop.id ? ' active' : ''}`}
                onClick={() => setShopFilter(shopFilter === shop.id ? null : shop.id)}
              >
                <ShopAvatar shop={shop} />
                <span className="shop-avatar-name">{shop.name}</span>
              </button>
            ))}
          </div>
        )}
        {shopFilter !== null && (
          <button type="button" className="filter-chip" onClick={() => setShopFilter(null)}>
            Shop: {shopNames.get(String(shopFilter)) || 'Selected'}
            <Icon name="close" size={12} />
          </button>
        )}
      </section>

      {loading ? (
        <div className="center-screen">
          <div className="spinner" />
          <p>Loading…</p>
        </div>
      ) : sections.length === 0 && !error ? (
        <div className="empty-state">
          <p>No products found.</p>
        </div>
      ) : (
        sections.map(([cat, prods]) => (
          <section key={cat} className="product-section">
            <h2>{cat}</h2>
            <div className="product-row-scroll">
              {prods.map((p) => (
                <ProductCard
                  key={p.id}
                  product={p}
                  shopName={shopNames.get(String(p.shop_id))}
                  onAdd={() =>
                    addItem(p, { id: p.shop_id, name: shopNames.get(String(p.shop_id)) })
                  }
                />
              ))}
            </div>
          </section>
        ))
      )}

      {scanItems !== null && (
        <ScanSheet items={scanItems} onClose={() => setScanItems(null)} />
      )}
    </div>
  );
}
