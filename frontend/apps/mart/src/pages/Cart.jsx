import { Link, useNavigate } from 'react-router-dom';
import { useCart } from '../CartContext.jsx';
import { formatPrice } from '../shopUtils';

export default function Cart() {
  const { items, shopName, total, setQuantity, removeItem, clear } = useCart();
  const navigate = useNavigate();

  if (items.length === 0) {
    return (
      <div className="page">
        <h1>Your cart</h1>
        <p className="muted">Your cart is empty.</p>
        <Link to="/" className="btn btn-primary">
          Browse shops
        </Link>
      </div>
    );
  }

  return (
    <div className="page">
      <div className="page-header">
        <h1>Your cart</h1>
        <button type="button" className="btn btn-outline btn-sm" onClick={clear}>
          Clear
        </button>
      </div>
      {shopName && (
        <p className="muted">
          Ordering from <strong>{shopName}</strong>
        </p>
      )}

      <div className="cart-list">
        {items.map(({ product, quantity }) => (
          <div key={product.id} className="cart-item">
            <div className="cart-item-info">
              <h3>{product.name}</h3>
              <span className="price">{formatPrice(product.price)}</span>
            </div>
            <div className="qty-stepper">
              <button
                type="button"
                className="btn btn-outline btn-sm"
                onClick={() => setQuantity(product.id, quantity - 1)}
                aria-label="Decrease quantity"
              >
                −
              </button>
              <span className="qty">{quantity}</span>
              <button
                type="button"
                className="btn btn-outline btn-sm"
                onClick={() => setQuantity(product.id, quantity + 1)}
                aria-label="Increase quantity"
              >
                +
              </button>
            </div>
            <div className="cart-item-right">
              <span className="price">
                {formatPrice((Number(product.price) || 0) * quantity)}
              </span>
              <button
                type="button"
                className="link-btn"
                onClick={() => removeItem(product.id)}
              >
                Remove
              </button>
            </div>
          </div>
        ))}
      </div>

      <div className="cart-summary">
        <span>Total</span>
        <span className="price price-lg">{formatPrice(total)}</span>
      </div>

      <button
        type="button"
        className="btn btn-primary btn-block btn-lg"
        onClick={() => navigate('/checkout')}
      >
        Proceed to checkout
      </button>
    </div>
  );
}
