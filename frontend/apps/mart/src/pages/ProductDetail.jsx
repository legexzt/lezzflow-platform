import { useEffect, useMemo, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import api from '../api';
import { useCart } from '../CartContext.jsx';
import { formatPrice, getProductImage } from '../shopUtils';

// Turn a stored category slug like "beverages-and-beverages-preparations"
// into a human-readable label like "Beverages".
function humanizeCategory(slug) {
  const words = String(slug || '')
    .toLowerCase()
    .split(/[-_\s]+/)
    .filter((w) => w && w !== 'and');
  const seen = new Set();
  const unique = [];
  for (const word of words) {
    if (seen.has(word)) break; // slug repeats itself (parent-and-parent-child) — stop
    seen.add(word);
    unique.push(word);
  }
  return unique.map((w) => w.charAt(0).toUpperCase() + w.slice(1)).join(' ');
}

export default function ProductDetail() {
  const { id } = useParams();
  const navigate = useNavigate();
  const cart = useCart();
  const { addItem, shopId, count } = cart;
  const cartItems = cart.items || [];
  const setQuantity = cart.setQuantity;

  const [product, setProduct] = useState(null);
  const [shop, setShop] = useState(null);
  const [loading, setLoading] = useState(true);
  const [notFound, setNotFound] = useState(false);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');

  useEffect(() => {
    let mounted = true;
    setLoading(true);
    setError('');
    setNotFound(false);
    setProduct(null);
    api
      .get(`/api/products/${id}`)
      .then((res) => {
        if (!mounted) return;
        const p = res.data?.product || res.data;
        if (!p || typeof p !== 'object' || p.id == null) {
          setNotFound(true);
        } else {
          setProduct(p);
        }
      })
      .catch((e) => {
        if (!mounted) return;
        if (e.response?.status === 404) {
          setNotFound(true);
        } else {
          setError(e.response?.data?.error || 'Failed to load this product.');
        }
      })
      .finally(() => {
        if (mounted) setLoading(false);
      });
    return () => {
      mounted = false;
    };
  }, [id]);

  // "Sold by" line — secondary fetch; if it fails the page works without it.
  useEffect(() => {
    if (!product?.shop_id) return undefined;
    let mounted = true;
    setShop(null);
    api
      .get(`/api/shops/${product.shop_id}`)
      .then((res) => {
        if (mounted) setShop(res.data?.shop || res.data);
      })
      .catch(() => {
        // Shop name is nice-to-have; ignore failures.
      });
    return () => {
      mounted = false;
    };
  }, [product?.shop_id]);

  // Quantity of this product already in the cart (drives stepper vs Add button).
  const inCartQty = useMemo(() => {
    const found = cartItems.find((i) => String(i.product?.id) === String(id));
    return found?.quantity || 0;
  }, [cartItems, id]);

  // Same one-shop-per-order cart mechanism as ShopDetail.jsx.
  const handleAdd = () => {
    if (!product) return;
    if (shopId && product.shop_id && String(shopId) !== String(product.shop_id)) {
      setNotice('Your cart was switched to this shop (one shop per order).');
    }
    addItem(product, shop || { id: product.shop_id });
  };

  if (loading) {
    return (
      <div className="center-screen">
        <div className="spinner" />
        <p>Loading…</p>
      </div>
    );
  }

  if (notFound) {
    return (
      <div className="page">
        <div className="empty-state">
          <p>Product not found.</p>
        </div>
        <Link to="/" className="btn btn-outline">
          ← Back to home
        </Link>
      </div>
    );
  }

  if (error || !product) {
    return (
      <div className="page">
        <div className="banner banner-error">{error || 'Failed to load this product.'}</div>
        <Link to="/" className="btn btn-outline">
          ← Back to home
        </Link>
      </div>
    );
  }

  const image = getProductImage(product);
  const price = Number(product.price);
  const mrp = Number(product.cost_price);
  const hasDiscount = Number.isFinite(mrp) && Number.isFinite(price) && mrp > price;
  const discountPct = hasDiscount ? Math.round(((mrp - price) / mrp) * 100) : 0;
  const packSize = product.pack_size || product.unit || product.weight || '';
  const description =
    (product.description || '').trim() ||
    `Fresh, quality ${
      humanizeCategory(product.category) || 'Groceries'
    } sourced daily from your neighbourhood kirana.`;

  return (
    <div className="page product-detail">
      <button type="button" className="back-link" onClick={() => navigate(-1)}>
        ← Back
      </button>

      {image && (
        <img
          src={image}
          alt={product.name}
          className="product-detail-image"
        />
      )}

      <div className="shop-header">
        <h1>{product.name}</h1>
        {packSize && <p className="muted">{packSize}</p>}
        {shop?.name && <p className="muted">Sold by {shop.name}</p>}
      </div>

      <div className="product-detail-price">
        <span className="price" style={{ fontSize: '1.75rem', fontWeight: 700 }}>
          {formatPrice(product.price)}
        </span>
        {hasDiscount && (
          <>
            <span className="muted" style={{ textDecoration: 'line-through' }}>
              {formatPrice(mrp)}
            </span>
            <span className="chip chip-open">{discountPct}% off</span>
          </>
        )}
      </div>

      <p className="muted product-desc">{description}</p>

      {notice && <div className="banner banner-info">{notice}</div>}

      {typeof setQuantity === 'function' && inCartQty > 0 ? (
        <div className="qty-stepper">
          <button
            type="button"
            className="btn btn-outline btn-sm"
            onClick={() => setQuantity(product.id, inCartQty - 1)}
            aria-label="Decrease quantity"
          >
            −
          </button>
          <span className="qty-stepper-value">{inCartQty}</span>
          <button
            type="button"
            className="btn btn-outline btn-sm"
            onClick={() => setQuantity(product.id, inCartQty + 1)}
            aria-label="Increase quantity"
          >
            +
          </button>
        </div>
      ) : (
        <button type="button" className="btn btn-primary btn-block" onClick={handleAdd}>
          Add to Cart
        </button>
      )}

      {count > 0 && (
        <Link to="/cart" className="btn btn-outline btn-block cart-cta">
          View cart ({count})
        </Link>
      )}

      <div className="product-detail-info">
        <div className="product-detail-info-row">
          <strong>Delivery</strong>
          <span className="muted">Fast delivery from your neighbourhood shop.</span>
        </div>
        <div className="product-detail-info-row">
          <strong>Returns</strong>
          <span className="muted">Easy return or refund for damaged or wrong items.</span>
        </div>
      </div>
    </div>
  );
}
