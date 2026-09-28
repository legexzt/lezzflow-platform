import { forwardRef } from 'react'

function lineTotal(it) {
  const qty = it.quantity ?? it.qty ?? 1
  return (Number(it.price) || 0) * qty
}

/**
 * 80mm thermal-printer packing slip. Rendered inside #packing-slip-print;
 * print CSS in styles.css hides the rest of the app when printing.
 */
const PackingSlip = forwardRef(function PackingSlip({ order, shop }, ref) {
  if (!order) return null
  const items = Array.isArray(order.items) ? order.items : []
  const subtotal = items.reduce((s, it) => s + lineTotal(it), 0)
  const discount = Number(order.discount_amount) || 0
  const total = order.total ?? subtotal - discount
  const created = order.created_at ? new Date(order.created_at) : null

  return (
    <div className="packing-slip" ref={ref}>
      <div className="slip-center slip-shop">{shop?.name || 'Shop'}</div>
      {shop?.address && <div className="slip-center slip-small">{shop.address}</div>}
      <div className="slip-divider" />
      <div className="slip-row">
        <span>Order #{String(order.id).slice(-6).toUpperCase()}</span>
        <span>{created ? created.toLocaleString() : ''}</span>
      </div>
      <div className="slip-row">
        <span>{order.fulfillment === 'delivery' ? 'DELIVERY' : 'PICKUP'}</span>
        <span>{order.status}</span>
      </div>
      {order.customer_name && (
        <div className="slip-row">
          <span>Customer</span>
          <span>{order.customer_name}</span>
        </div>
      )}
      <div className="slip-divider" />
      {items.map((it, i) => (
        <div key={i} className="slip-item">
          <div className="slip-row">
            <span>
              {it.name || it.product_name || 'Item'} × {it.quantity ?? it.qty ?? 1}
            </span>
            <span>₹{lineTotal(it).toFixed(2)}</span>
          </div>
          {it.price != null && (
            <div className="slip-row slip-small">
              <span>@ ₹{Number(it.price).toFixed(2)} each</span>
            </div>
          )}
        </div>
      ))}
      <div className="slip-divider" />
      <div className="slip-row">
        <span>Subtotal</span>
        <span>₹{subtotal.toFixed(2)}</span>
      </div>
      {discount > 0 && (
        <div className="slip-row">
          <span>Offer discount</span>
          <span>− ₹{discount.toFixed(2)}</span>
        </div>
      )}
      <div className="slip-row slip-total">
        <span>TOTAL</span>
        <span>₹{Number(total).toFixed(2)}</span>
      </div>
      <div className="slip-divider" />
      <div className="slip-center slip-small">Payment: coming soon</div>
      <div className="slip-center slip-thanks">Thank you! Visit again.</div>
    </div>
  )
})

export default PackingSlip
