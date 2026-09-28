import { useEffect, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import api from '../api';
import { useCart } from '../CartContext.jsx';
import PaymentBadge from '../components/PaymentBadge.jsx';
import { formatPrice } from '../shopUtils';
import Icon from '../components/Icon.jsx';

const ADDRESS_BOOK_KEY = 'lf_address_book';

function loadAddressBook() {
  try {
    const raw = localStorage.getItem(ADDRESS_BOOK_KEY);
    const list = raw ? JSON.parse(raw) : [];
    return Array.isArray(list) ? list : [];
  } catch {
    return [];
  }
}

function saveAddressBook(list) {
  try {
    localStorage.setItem(ADDRESS_BOOK_KEY, JSON.stringify(list));
  } catch {
    // storage unavailable — address book just won't persist
  }
}

/** Discount in rupees for one offer against a cart total. Real offer rows only. */
function discountForOffer(offer, cartTotal) {
  const minOrder = Number(offer.min_order) || 0;
  if (cartTotal < minOrder) return 0;
  const value = Number(offer.discount_value) || 0;
  const raw = offer.discount_type === 'percent' ? (cartTotal * value) / 100 : value;
  return Math.min(Math.max(raw, 0), cartTotal);
}

function offerTerms(offer) {
  const minOrder = Number(offer.min_order) || 0;
  const value = Number(offer.discount_value) || 0;
  const off =
    offer.discount_type === 'percent' ? `${value}% off` : `${formatPrice(value)} off`;
  const above = minOrder > 0 ? ` above ${formatPrice(minOrder)}` : '';
  return `${off}${above} — the shop's own offer`;
}

export default function Checkout() {
  const { items, shopId, shopName, total, clear, removeItem, refreshItemProduct } = useCart();
  const [fulfillment, setFulfillment] = useState(null); // 'delivery' | 'pickup'
  const [address, setAddress] = useState('');
  const [landmark, setLandmark] = useState('');
  const [addressBook, setAddressBook] = useState(loadAddressBook);
  const [placing, setPlacing] = useState(false);
  const [revalidating, setRevalidating] = useState(false);
  const [error, setError] = useState('');
  const [changes, setChanges] = useState(null); // stale-cart diff awaiting user accept
  const [offers, setOffers] = useState([]);
  const navigate = useNavigate();

  // Load the shop's real Dukaan Offers (active, in-window only — backend filters).
  useEffect(() => {
    if (!shopId) return;
    let mounted = true;
    api
      .get(`/api/v1/shops/${shopId}/offers`)
      .then((res) => {
        if (mounted) setOffers(Array.isArray(res.data) ? res.data : []);
      })
      .catch(() => {
        if (mounted) setOffers([]);
      });
    return () => {
      mounted = false;
    };
  }, [shopId]);

  // Best eligible offer, auto-applied. Nothing shown when no offer qualifies.
  const appliedOffer = (() => {
    let best = null;
    let bestDiscount = 0;
    for (const offer of offers) {
      const d = discountForOffer(offer, total);
      if (d > bestDiscount) {
        bestDiscount = d;
        best = offer;
      }
    }
    return best ? { offer: best, discount: bestDiscount } : null;
  })();
  const payableTotal = Math.max(total - (appliedOffer?.discount || 0), 0);

  if (items.length === 0) {
    return (
      <div className="page">
        <h1>Checkout</h1>
        <p className="muted">Your cart is empty.</p>
        <Link to="/" className="btn btn-primary">
          Browse shops
        </Link>
      </div>
    );
  }

  /** Re-check every cart item against live price/stock before ordering. */
  const revalidateCart = async () => {
    setRevalidating(true);
    setError('');
    try {
      const res = await api.get('/api/products', { params: { shop_id: shopId } });
      const live = Array.isArray(res.data) ? res.data : res.data?.products || [];
      const liveById = new Map(live.map((p) => [String(p.id), p]));

      const diffs = [];
      for (const item of items) {
        const lp = liveById.get(String(item.product.id));
        if (!lp || lp.stock === 0 || lp.available === false) {
          diffs.push({ item, kind: 'removed', live: lp });
          continue;
        }
        const livePrice = Number(lp.price) || 0;
        const cartPrice = Number(item.product.price) || 0;
        if (livePrice !== cartPrice) {
          diffs.push({ item, kind: 'price', live: lp, from: cartPrice, to: livePrice });
        }
        if (Number(lp.stock) < item.quantity) {
          diffs.push({ item, kind: 'stock', live: lp });
        }
      }
      return diffs;
    } finally {
      setRevalidating(false);
    }
  };

  /** Apply the accepted live reality to the cart, then continue. */
  const applyChangesAndContinue = () => {
    // Build the corrected item list locally — React state updates are async,
    // so placeOrder must use this fresh list, not the stale closure `items`.
    const corrected = [];
    for (const item of items) {
      const diff = (changes || []).find((d) => d.item.product.id === item.product.id);
      if (!diff) {
        corrected.push(item);
        continue;
      }
      if (diff.kind === 'removed') {
        removeItem(item.product.id);
        continue; // dropped from the order
      }
      if (diff.kind === 'price') {
        refreshItemProduct(item.product.id, { price: diff.to });
        corrected.push({ ...item, product: { ...item.product, price: diff.to } });
        continue;
      }
      corrected.push(item); // 'stock' note only — seller confirms at packing
    }
    setChanges(null);
    placeOrder(corrected);
  };

  const handleProceed = async () => {
    if (!fulfillment) {
      setError('Please choose Delivery or Self-pickup.');
      return;
    }
    if (fulfillment === 'delivery' && !address.trim()) {
      setError('Please enter a delivery address.');
      return;
    }
    const diffs = await revalidateCart();
    if (diffs.length > 0) {
      setChanges(diffs); // user must accept the honest diff — nothing applied silently
      return;
    }
    placeOrder();
  };

  const placeOrder = async (orderItems = items) => {
    setPlacing(true);
    setError('');
    try {
      const payload = {
        shop_id: shopId,
        items: orderItems.map((i) => ({
          product_id: i.product.id,
          name: i.product.name,
          quantity: i.quantity,
          price: Number(i.product.price) || 0,
        })),
        fulfillment,
      };
      if (fulfillment === 'delivery') {
        let fullAddress = address.trim();
        if (landmark.trim()) fullAddress += `\nLandmark: ${landmark.trim()}`;
        payload.address = fullAddress;
      }
      if (appliedOffer) {
        // Server validates the offer and computes the discount — we only suggest it.
        payload.offer_id = appliedOffer.offer.id;
      }

      const res = await api.post('/api/orders', payload);
      const order = res.data || {};
      const orderId = order.id ?? order.order_id ?? order.orderId;

      let notice = '';
      if (fulfillment === 'delivery' && orderId) {
        try {
          await api.post(`/api/orders/${orderId}/assign-delivery`);
        } catch {
          notice =
            'Order placed. Delivery assignment is pending — the store will confirm shortly.';
        }
      }

      // Remember this address for next time (one tap reuse).
      if (fulfillment === 'delivery' && address.trim()) {
        const entry = {
          label: landmark.trim() ? landmark.trim().slice(0, 24) : `Address ${addressBook.length + 1}`,
          address: address.trim(),
          landmark: landmark.trim(),
        };
        const updated = [entry, ...addressBook.filter((a) => a.address !== entry.address)].slice(0, 5);
        setAddressBook(updated);
        saveAddressBook(updated);
      }

      clear();
      navigate('/orders', { state: { notice } });
    } catch (e) {
      setError(
        e.response?.data?.error ||
          e.response?.data?.message ||
          'Failed to place order. Please try again.'
      );
    } finally {
      setPlacing(false);
    }
  };

  const pickSavedAddress = (entry) => {
    setAddress(entry.address);
    setLandmark(entry.landmark || '');
  };

  return (
    <div className="page">
      <h1>Checkout</h1>
      {shopName && (
        <p className="muted">
          Ordering from <strong>{shopName}</strong>
        </p>
      )}

      <h2>How do you want your order?</h2>
      <div className="choice-row">
        <button
          type="button"
          className={`choice-btn ${fulfillment === 'delivery' ? 'selected' : ''}`}
          onClick={() => setFulfillment('delivery')}
        >
          <span className="choice-icon"><Icon name="scooter" size={28} /></span>
          <span className="choice-title">Delivery</span>
          <span className="choice-sub">A LezzFlow partner brings it to you</span>
        </button>
        <button
          type="button"
          className={`choice-btn ${fulfillment === 'pickup' ? 'selected' : ''}`}
          onClick={() => setFulfillment('pickup')}
        >
          <span className="choice-icon"><Icon name="bag" size={28} /></span>
          <span className="choice-title">Self-pickup</span>
          <span className="choice-sub">Collect from the shop yourself</span>
        </button>
      </div>

      {fulfillment === 'delivery' && (
        <>
          {addressBook.length > 0 && (
            <div className="address-book">
              <p className="muted small">Saved addresses</p>
              <div className="chip-row">
                {addressBook.map((entry, i) => (
                  <button
                    key={`${entry.label}-${i}`}
                    type="button"
                    className="chip chip-clickable"
                    onClick={() => pickSavedAddress(entry)}
                  >
                    <Icon name="location" size={12} /> {entry.label}
                  </button>
                ))}
              </div>
            </div>
          )}
          <div className="form-group">
            <label htmlFor="address">Delivery address</label>
            <textarea
              id="address"
              rows="3"
              placeholder="House / flat, street…"
              value={address}
              onChange={(e) => setAddress(e.target.value)}
            />
          </div>
          <div className="form-group">
            <label htmlFor="landmark">Landmark (helps the delivery partner find you)</label>
            <input
              id="landmark"
              type="text"
              placeholder="e.g. near Hanuman temple, green gate"
              value={landmark}
              onChange={(e) => setLandmark(e.target.value)}
            />
          </div>
        </>
      )}

      {appliedOffer && (
        <div className="banner banner-offer">
          <Icon name="money" size={16} />
          <span>
            <strong>{appliedOffer.offer.title}:</strong> {offerTerms(appliedOffer.offer)} —{' '}
            {formatPrice(appliedOffer.discount)} off applied
          </span>
        </div>
      )}

      <div className="cart-summary">
        <span>
          {items.reduce((n, i) => n + i.quantity, 0)} items · {fulfillment || 'choose above'}
        </span>
        <span className="price price-lg">{formatPrice(payableTotal)}</span>
      </div>
      {appliedOffer && (
        <p className="muted small" style={{ textAlign: 'right' }}>
          <s>{formatPrice(total)}</s> − {formatPrice(appliedOffer.discount)} offer
        </p>
      )}

      <div className="payment-row">
        <PaymentBadge />
      </div>

      {error && <div className="banner banner-error">{error}</div>}

      {changes && changes.length > 0 && (
        <div className="banner banner-warning">
          <h3>Something changed at the shop</h3>
          <ul>
            {changes.map((diff, i) => (
              <li key={i}>
                {diff.kind === 'price' &&
                  `${diff.item.product.name}: price changed ${formatPrice(diff.from)} → ${formatPrice(diff.to)}`}
                {diff.kind === 'removed' &&
                  `${diff.item.product.name}: out of stock — will be removed`}
                {diff.kind === 'stock' &&
                  `${diff.item.product.name}: only ${diff.live.stock} left in stock`}
              </li>
            ))}
          </ul>
          <div className="btn-row">
            <button type="button" className="btn btn-primary" onClick={applyChangesAndContinue}>
              Update cart and continue
            </button>
            <button type="button" className="btn btn-outline" onClick={() => setChanges(null)}>
              Back to cart
            </button>
          </div>
        </div>
      )}

      <button
        type="button"
        className="btn btn-primary btn-block btn-lg"
        onClick={handleProceed}
        disabled={placing || revalidating || !fulfillment || changes}
      >
        {revalidating
          ? 'Checking live prices…'
          : placing
            ? 'Placing order…'
            : fulfillment === 'delivery'
              ? 'Place order for delivery'
              : fulfillment === 'pickup'
                ? 'Place order for pickup'
                : 'Place order'}
      </button>
    </div>
  );
}
