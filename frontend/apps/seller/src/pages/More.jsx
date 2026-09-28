import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { useAuth } from '../AuthContext.jsx'
import { signOutUser } from '../firebase.js'
import Icon from '../components/Icon.jsx'
import api from '../api.js'
import { useAlertCtx } from '../components/OrderAlertHost.jsx'
import { useLang } from '../LanguageContext.jsx'

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

const SOUND_STYLES = ['bell', 'classic', 'soft']
const PACK_MINS = [10, 15, 20]

export default function More() {
  const { user } = useAuth()
  const alertCtx = useAlertCtx()
  const { lang, setLang, t } = useLang()

  // Live commission config (Item 3): 0 bps during beta.
  const [commissionBps, setCommissionBps] = useState(0)
  useEffect(() => {
    api
      .get('/v1/config')
      .then((res) => setCommissionBps(res.data?.commission_bps ?? 0))
      .catch(() => {
        // Offline or error — keep the default 0 (beta sentence)
      })
  }, [])
  const commissionSentence =
    commissionBps === 0
      ? '₹0 commission during beta. Future pricing will be published transparently before activation.'
      : `${commissionBps / 100}% commission. Future pricing will be published transparently before activation.`

  // alertCtx may be null if OrderAlertHost isn't wrapping (safety guard)
  const soundOn = alertCtx?.soundOn ?? true
  const soundStyle = alertCtx?.soundStyle ?? 'bell'
  const vibrateOn = alertCtx?.vibrateOn ?? true
  const packMins = alertCtx?.packMins ?? 15
  const pushDenied = alertCtx?.pushDenied ?? false
  const pushGranted = alertCtx?.pushGranted ?? false

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
        <Link to="/offers" className="settings-row">
          <Icon name="megaphone" size={20} />
          <span>{t('title_offers')}</span>
        </Link>
      </div>

      {/* ---- Language ---- */}
      <div className="card">
        <h3 style={{ margin: '0 0 4px', fontSize: 15, fontWeight: 700 }}>{t('language')}</h3>
        <div className="lang-row">
          {['en', 'hi', 'hing'].map((l) => (
            <button
              key={l}
              type="button"
              className={`chip ${lang === l ? 'active' : ''}`}
              onClick={() => setLang(l)}
            >
              {t(`lang_${l}`)}
            </button>
          ))}
        </div>
      </div>

      {/* ---- Order alerts settings (Item 1, §1.4) ---- */}
      <div className="card" style={{ padding: 0 }}>
        <div style={{ padding: '12px 16px 4px' }}>
          <h3 style={{ margin: 0, fontSize: 15, fontWeight: 700, display: 'flex', alignItems: 'center', gap: 8 }}>
            <Icon name="bell" size={18} style={{ color: 'var(--amber)' }} />
            Order alerts
          </h3>
        </div>

        {/* 1. New order sound switch */}
        <div className="settings-row">
          <Icon name="bell" size={20} />
          <span style={{ flex: 1 }}>New order sound</span>
          <button
            type="button"
            className={`switch ${soundOn ? 'on' : ''}`}
            onClick={() => alertCtx?.setSoundOn?.(!soundOn)}
            role="switch"
            aria-checked={soundOn}
            aria-label="New order sound"
          >
            <span className="knob" />
          </button>
        </div>

        {/* 2. Sound style chips */}
        <div className="settings-row" style={{ flexWrap: 'wrap', gap: 10 }}>
          <Icon name="play" size={20} />
          <span style={{ flex: 1 }}>Sound style</span>
          <div style={{ display: 'flex', gap: 8 }}>
            {SOUND_STYLES.map((s) => (
              <button
                key={s}
                type="button"
                className={`chip ${soundStyle === s ? 'active' : ''}`}
                style={{ display: 'flex', alignItems: 'center', gap: 4, minHeight: 36, padding: '4px 10px' }}
                onClick={() => {
                  alertCtx?.setSoundStyle?.(s)
                  alertCtx?.previewSound?.(s)
                }}
              >
                {s.charAt(0).toUpperCase() + s.slice(1)}
                <Icon name="play" size={12} />
              </button>
            ))}
          </div>
        </div>

        {/* 3. Vibrate switch */}
        <div className="settings-row">
          <Icon name="bell" size={20} />
          <span style={{ flex: 1 }}>Vibrate on new order</span>
          <button
            type="button"
            className={`switch ${vibrateOn ? 'on' : ''}`}
            onClick={() => alertCtx?.setVibrateOn?.(!vibrateOn)}
            role="switch"
            aria-checked={vibrateOn}
            aria-label="Vibrate on new order"
          >
            <span className="knob" />
          </button>
        </div>

        {/* 4. Packing time chips */}
        <div className="settings-row" style={{ flexWrap: 'wrap', gap: 10 }}>
          <Icon name="clock" size={20} />
          <span style={{ flex: 1 }}>Packing time</span>
          <div style={{ display: 'flex', gap: 8 }}>
            {PACK_MINS.map((m) => (
              <button
                key={m}
                type="button"
                className={`chip ${packMins === m ? 'active' : ''}`}
                style={{ minHeight: 36, padding: '4px 10px' }}
                onClick={() => alertCtx?.setPackMins?.(m)}
              >
                {m} min
              </button>
            ))}
          </div>
        </div>

        {/* 5. Test alert button */}
        <div className="settings-row">
          <Icon name="bell" size={20} />
          <span style={{ flex: 1 }}>Test alert</span>
          <button
            type="button"
            className="btn btn-outline btn-sm"
            onClick={() => alertCtx?.triggerTestAlert?.()}
          >
            Test
          </button>
        </div>

        {/* 6. Silent-mode helper line */}
        <div style={{ padding: '8px 16px 12px', fontSize: 12, color: 'var(--muted)' }}>
          <Icon name="info" size={12} style={{ verticalAlign: -2, marginRight: 4 }} />
          If your phone is on silent, the ring may not play — keep vibrate on.
        </div>

        {/* 7. Background alerts — Push permission row */}
        {!pushGranted && !pushDenied && (
          <div className="settings-row">
            <Icon name="bell" size={20} />
            <span style={{ flex: 1 }}>Background alerts</span>
            <button
              type="button"
              className="btn btn-primary btn-sm"
              onClick={() => alertCtx?.requestPush?.()}
            >
              Turn on
            </button>
          </div>
        )}

        {/* Push denied — honest grey card per §1.5 */}
        {pushDenied && (
          <div style={{ padding: '10px 16px 14px' }}>
            <div className="card" style={{ background: '#f5f5f5', border: '1px solid #e0e0e0', color: 'var(--muted)', fontSize: 13, lineHeight: 1.5 }}>
              Browser alerts are blocked. Keep the app open — it checks for new orders every 30 seconds and rings loudly. To allow background alerts later: browser Settings → Notifications → allow this site.
            </div>
          </div>
        )}

        {pushGranted && (
          <div className="settings-row">
            <Icon name="bell" size={20} />
            <span style={{ flex: 1 }}>Background alerts</span>
            <span className="badge badge-green">On</span>
          </div>
        )}
      </div>

      <div className="card">
        <h3><Icon name="money" size={18} /> Pricing &amp; commission</h3>
        <p className="muted">{commissionSentence}</p>
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
