import { useEffect, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import api from '../api';
import { useCart } from '../CartContext.jsx';
import { formatDistance, formatPrice, getProductImage } from '../shopUtils';
import CompareSheet from '../components/CompareSheet.jsx';
import Icon from '../components/Icon.jsx';

// Orders at this shop needed before the customer counts as a "regular".
// Seller-configurable later; counts only real orders from the orders table.
const REGULAR_ORDER_THRESHOLD = 3;

export default function ShopDetail() {
  const { id } = useParams();
  const { addItem, shopId, count } = useCart();
  const [shop, setShop] = useState(null);
  const [products, setProducts] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const [compareFor, setCompareFor] = useState(null);
  const [regularOrders, setRegularOrders] = useState(0);

  useEffect(() => {
    let mounted = true;
    setLoading(true);
    setError('');
    Promise.all([
      api.get(`/api/shops/${id}`),
      api.get('/api/products', { params: { shop_id: id } }),
      api.get('/api/orders').catch(() => ({ data: [] })),
    ])
      .then(([shopRes, productsRes, ordersRes]) => {
        if (!mounted) return;
        setShop(shopRes.data);
        const list = Array.isArray(productsRes.data)
          ? productsRes.data
          : productsRes.data?.products || [];
        setProducts(list);
        const orders = Array.isArray(ordersRes.data)
          ? ordersRes.data
          : ordersRes.data?.orders || [];
        const mine = orders.filter(
          (o) => String(o.shop_id) === String(id) && o.status !== 'cancelled'
        );
        setRegularOrders(mine.length);
      })
      .catch((e) => {
        if (mounted) setError(e.response?.data?.error || 'Failed to load this shop.');
      })
      .finally(() => {
        if (mounted) setLoading(false);
      });
    return () => {
      mounted = false;
    };
  }, [id]);

  const handleAdd = (product) => {
    if (shopId && shop?.id && shopId !== shop.id) {
      setNotice('Your cart was switched to this shop (one shop per order).');
    }
    addItem(product, shop || { id });
  };

  if (loading) {
    return (
      <div className="center-screen">
        <div className="spinner" />
        <p>Loading shop…</p>
      </div>
    );
  }

  if (error) {
    return (
      <div className="page">
        <div className="banner banner-error">{error}</div>
        <Link to="/" className="btn btn-outline">
          ← Back to shops
        </Link>
      </div>
    );
  }

  const distance = shop ? formatDistance(shop) : null;
  const shopClosed = shop?.is_open === false;
  const isRegular = regularOrders >= REGULAR_ORDER_THRESHOLD;

  return (
    <div className="page">
      <Link to="/" className="back-link">
        ← All shops
      </Link>

      <div className="shop-header">
        <h1>{shop?.name || 'Shop'}</h1>
        {shop?.address && <p className="muted">{shop.address}</p>}
        <div className="chip-row">
          {distance && <span className="chip">{distance} away</span>}
          {shop?.is_open === true && <span className="chip chip-open">Open now</span>}
          {shop?.is_open === false && <span className="chip chip-closed">Closed</span>}
          {isRegular && (
            <span className="chip chip-regular">
              <Icon name="check" size={12} /> You are a regular here
            </span>
          )}
        </div>
      </div>

      {notice && <div className="banner banner-info">{notice}</div>}

      <h2>Products</h2>
      {products.length === 0 ? (
        <p className="muted">This shop has not listed any products yet.</p>
      ) : (
        <div className="product-grid">
          {products.map((product) => {
            const image = getProductImage(product);
            const outOfStock = product.stock === 0 || product.available === false;
            return (
              <div key={product.id} className="product-card">
                {image && (
                  <img src={image} alt={product.name} className="product-image" />
                )}
                <div className="product-body">
                  <h3>{product.name}</h3>
                  {product.category && <p className="muted">{product.category}</p>}
                  {product.description && (
                    <p className="muted product-desc">{product.description}</p>
                  )}
                  <div className="product-footer">
                    <span className="price">{formatPrice(product.price)}</span>
                    {shopClosed && (
                      <span className="muted closed-note">Shop is closed</span>
                    )}
                    <button
                      type="button"
                      className="btn btn-primary btn-sm"
                      onClick={() => handleAdd(product)}
                      disabled={outOfStock || shopClosed}
                    >
                      {outOfStock ? 'Out of stock' : 'Add'}
                    </button>
                  </div>
                  {!shopClosed && (
                    <button
                      type="button"
                      className="link-btn compare-link"
                      onClick={() => setCompareFor(product.name)}
                    >
                      Compare nearby
                    </button>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      )}

      {count > 0 && (
        <Link to="/cart" className="btn btn-primary btn-block cart-cta">
          View cart ({count})
        </Link>
      )}

      {compareFor && (
        <CompareSheet
          productName={compareFor}
          shopId={id}
          onClose={() => setCompareFor(null)}
        />
      )}
    </div>
  );
}
