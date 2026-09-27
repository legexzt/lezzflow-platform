import { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import api from '../api';
import { useCart } from '../CartContext.jsx';
import PaymentBadge from '../components/PaymentBadge.jsx';
import { formatPrice } from '../shopUtils';

export default function Checkout() {
  const { items, shopId, shopName, total, clear } = useCart();
  const [fulfillment, setFulfillment] = useState(null); // 'delivery' | 'pickup'
  const [address, setAddress] = useState('');
  const [placing, setPlacing] = useState(false);
  const [error, setError] = useState('');
  const navigate = useNavigate();

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

  const placeOrder = async () => {
    if (!fulfillment) {
      setError('Please choose Delivery or Self-pickup.');
      return;
    }
    if (fulfillment === 'delivery' && !address.trim()) {
      setError('Please enter a delivery address.');
      return;
    }
    setPlacing(true);
    setError('');
    try {
      const payload = {
        shop_id: shopId,
        items: items.map((i) => ({
          product_id: i.product.id,
          name: i.product.name,
          quantity: i.quantity,
          price: Number(i.product.price) || 0,
        })),
        fulfillment,
      };
      if (fulfillment === 'delivery') {
        payload.address = address.trim();
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
          <span className="choice-icon">🛵</span>
          <span className="choice-title">Delivery</span>
          <span className="choice-sub">A LezzFlow partner brings it to you</span>
        </button>
        <button
          type="button"
          className={`choice-btn ${fulfillment === 'pickup' ? 'selected' : ''}`}
          onClick={() => setFulfillment('pickup')}
        >
          <span className="choice-icon">🛍️</span>
          <span className="choice-title">Self-pickup</span>
          <span className="choice-sub">Collect from the shop yourself</span>
        </button>
      </div>

      {fulfillment === 'delivery' && (
        <div className="form-group">
          <label htmlFor="address">Delivery address</label>
          <textarea
            id="address"
            rows="3"
            placeholder="House / flat, street, landmark…"
            value={address}
            onChange={(e) => setAddress(e.target.value)}
          />
        </div>
      )}

      <div className="cart-summary">
        <span>
          {items.reduce((n, i) => n + i.quantity, 0)} items · {fulfillment || 'choose above'}
        </span>
        <span className="price price-lg">{formatPrice(total)}</span>
      </div>

      <div className="payment-row">
        <PaymentBadge />
      </div>

      {error && <div className="banner banner-error">{error}</div>}

      <button
        type="button"
        className="btn btn-primary btn-block btn-lg"
        onClick={placeOrder}
        disabled={placing || !fulfillment}
      >
        {placing
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
