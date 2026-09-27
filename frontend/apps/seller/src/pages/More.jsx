import { Link } from 'react-router-dom'
import { useAuth } from '../AuthContext.jsx'
import { signOutUser } from '../firebase.js'
import Icon from '../components/Icon.jsx'

const SUPPORT_ITEMS = [
  {
    title: 'How LezzFlow works',
    body: 'Customers near your shop discover you on the Mart app, place orders for delivery or pickup, and you get instant order alerts. Keep your inventory updated and your shop marked open.',
  },
  {
    title: 'Orders & fulfilment',
    body: 'New orders appear under Orders. Accept, pack, and mark them ready. For delivery orders a partner is assigned; for pickup the customer comes to your shop.',
  },
  {
    title: 'Payments',
    body: 'Online payments are coming soon. For now, all orders are cash on delivery / cash on pickup.',
  },
  {
    title: 'Advisory',
    body: 'The Advisory tab helps you plan borrowing with the Finance Calculator and check local demand with the Feasibility Report before you invest in stock.',
  },
]

export default function More() {
  const { user } = useAuth()

  return (
    <div className="page">
      <div className="page-head">
        <h1 className="page-title">More</h1>
        <p className="muted">{user?.email || ''}</p>
      </div>

      <div className="card settings-card">
        <Link to="/shop" className="settings-row">
          <Icon name="home" size={20} />
          <span>My Shop</span>
        </Link>
        <Link to="/advisory" className="settings-row">
          <Icon name="chart" size={20} />
          <span>Business Advisory</span>
        </Link>
      </div>

      <div className="card">
        <h3><Icon name="help" size={18} /> Customer Support</h3>
        <div className="support-list">
          {SUPPORT_ITEMS.map((item) => (
            <details key={item.title} className="support-item">
              <summary>{item.title}</summary>
              <p className="muted">{item.body}</p>
            </details>
          ))}
        </div>
        <p className="muted small" style={{ marginTop: 12 }}>
          Need more help? Write to us at <strong>support@legezt.in</strong>
        </p>
      </div>

      <div className="card">
        <h3>About</h3>
        <p className="muted small">
          LezzFlow Seller — hyperlocal commerce for neighbourhood shops.
          Version 1.0 · Made by Team legezt
        </p>
      </div>

      <button
        type="button"
        className="btn btn-outline btn-block"
        onClick={() => signOutUser()}
        style={{ marginTop: 8 }}
      >
        Sign out
      </button>
    </div>
  )
}
