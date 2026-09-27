import { useEffect, useState } from 'react'
import api, { getErrorMessage } from '../api.js'
import { useToast } from '../components/Toast.jsx'
import Loading from '../components/Loading.jsx'

/* Verified scheme figures (SIH 2026): project cost = margin capital / 10%,
   i.e. 90% financing on both schemes. */
const SCHEMES = [
  {
    key: 'micro',
    name: 'Micro Finance',
    tagline: 'For first-time borrowers finding their feet',
    maxAmount: 140000,
    annualRate: 6.5,
    years: 3,
    moratoriumMonths: 3,
  },
  {
    key: 'term',
    name: 'Term Loan',
    tagline: 'For the big leap — expansion, machinery, a second store',
    maxAmount: 5000000,
    annualRate: 8,
    years: 7,
    moratoriumMonths: 6,
  },
]

const PURPOSES = ['Working capital', 'Shop expansion', 'New shop', 'Machinery / equipment']

function emiFor(principal, annualRatePct, years) {
  const r = annualRatePct / 12 / 100
  const n = years * 12
  if (r === 0) return principal / n
  const pow = Math.pow(1 + r, n)
  return (principal * r * pow) / (pow - 1)
}

function inr(n) {
  return '₹' + Math.round(n).toLocaleString('en-IN')
}

function FinanceCalculator() {
  const [amount, setAmount] = useState('100000')
  const [purpose, setPurpose] = useState(PURPOSES[0])

  const principal = Math.max(0, parseFloat(amount) || 0)
  // Scheme router: micro finance covers up to Rs.1.40 lakh
  const routed = principal <= SCHEMES[0].maxAmount ? SCHEMES[0] : SCHEMES[1]
  const other = routed === SCHEMES[0] ? SCHEMES[1] : SCHEMES[0]

  const emi = emiFor(principal, routed.annualRate, routed.years)
  const totalPayable = emi * routed.years * 12
  const totalInterest = totalPayable - principal
  // 90% financing -> borrower brings 10% margin; project cost = margin / 10%
  const marginNeeded = principal * 0.1
  const projectCost = principal / 0.9
  const overMax = principal > routed.maxAmount

  return (
    <div>
      <div className="card">
        <div className="field">
          <label htmlFor="loan-amount">How much do you need? (₹)</label>
          <input
            id="loan-amount"
            type="number"
            min="0"
            inputMode="numeric"
            value={amount}
            onChange={(e) => setAmount(e.target.value)}
            placeholder="e.g. 100000"
          />
        </div>
        <div className="field">
          <label htmlFor="loan-purpose">Purpose</label>
          <select id="loan-purpose" value={purpose} onChange={(e) => setPurpose(e.target.value)}>
            {PURPOSES.map((p) => (
              <option key={p} value={p}>{p}</option>
            ))}
          </select>
        </div>
        {overMax && (
          <p className="error-text">
            This exceeds the {routed.name} ceiling of {inr(routed.maxAmount)}. Consider splitting the requirement.
          </p>
        )}
      </div>

      <div className="card scheme-card">
        <div className="scheme-badge">Recommended for you</div>
        <h3>{routed.name}</h3>
        <p className="muted">{routed.tagline}</p>
        <div className="scheme-grid">
          <div><span className="k">Monthly EMI</span><span className="v big">{inr(emi)}</span></div>
          <div><span className="k">Interest rate</span><span className="v">{routed.annualRate}% p.a.</span></div>
          <div><span className="k">Tenure</span><span className="v">{routed.years} years</span></div>
          <div><span className="k">Moratorium</span><span className="v">{routed.moratoriumMonths} months (no EMI)</span></div>
          <div><span className="k">Total interest</span><span className="v">{inr(totalInterest)}</span></div>
          <div><span className="k">Total payable</span><span className="v">{inr(totalPayable)}</span></div>
        </div>
        <div className="margin-note">
          <strong>Your margin:</strong> {inr(marginNeeded)} (10%) ·
          <strong> Project cost:</strong> {inr(projectCost)} · 90% financed.
          First EMI starts after the {routed.moratoriumMonths}-month moratorium.
        </div>
      </div>

      <div className="card">
        <h3>Compare schemes</h3>
        <div className="compare-row">
          {SCHEMES.map((s) => {
            const sEmi = emiFor(Math.min(principal, s.maxAmount), s.annualRate, s.years)
            return (
              <div key={s.key} className={`compare-cell ${s.key === routed.key ? 'active' : ''}`}>
                <strong>{s.name}</strong>
                <span>Up to {inr(s.maxAmount)}</span>
                <span>{s.annualRate}% · {s.years} yrs</span>
                <span className="emi">EMI {inr(sEmi)}</span>
              </div>
            )
          })}
        </div>
        <p className="muted small">
          {other.name}: up to {inr(other.maxAmount)} at {other.annualRate}% for {other.years} years,
          {' '}{other.moratoriumMonths}-month moratorium.
        </p>
        <p className="muted small">
          Figures follow the standard micro &amp; term loan structure (90% financing).
          Final eligibility and sanction are the lender's decision.
        </p>
      </div>
    </div>
  )
}

function FeasibilityReport() {
  const toast = useToast()
  const [loading, setLoading] = useState(true)
  const [report, setReport] = useState(null)
  const [shopName, setShopName] = useState('')

  useEffect(() => {
    let cancelled = false
    ;(async () => {
      try {
        const shopRes = await api.get('/shops?mine=true')
        const shops = Array.isArray(shopRes.data) ? shopRes.data : shopRes.data?.shops || []
        const shop = shops[0]
        if (!shop?.lat || !shop?.lng) {
          if (!cancelled) {
            toast('Set your shop location first (Shop page → Use my location).', 'error')
            setLoading(false)
          }
          return
        }
        if (!cancelled) setShopName(shop.name)
        const res = await api.get('/advisory/feasibility', {
          params: { lat: shop.lat, lng: shop.lng },
        })
        if (!cancelled) setReport(res.data)
      } catch (err) {
        if (!cancelled) toast(getErrorMessage(err, 'Could not load feasibility report'), 'error')
      } finally {
        if (!cancelled) setLoading(false)
      }
    })()
    return () => { cancelled = true }
  }, [toast])

  if (loading) return <Loading />

  if (!report) {
    return (
      <div className="card">
        <p className="muted">No report available. Make sure your shop has a location set.</p>
      </div>
    )
  }

  const cats = Object.entries(report.categoryBreakdown || {})

  return (
    <div>
      <div className={`card verdict-card verdict-${report.verdict}`}>
        <div className="verdict-badge">
          {report.verdict === 'go' ? '✓ GO' : '⚠ CAUTION'}
        </div>
        <h3>{shopName ? `Feasibility for ${shopName}` : 'Feasibility report'}</h3>
        <p>{report.verdictReason}</p>
        <p className="muted small">Based on {report.nearbyShops} open shop(s) within {report.radiusKm} km.</p>
      </div>

      <div className="card">
        <h3>Competition nearby</h3>
        {cats.length === 0 ? (
          <p className="muted">No product listings from nearby shops yet.</p>
        ) : (
          <div className="bar-list">
            {cats.map(([cat, n]) => (
              <div key={cat} className="bar-row">
                <span className="bar-label">{cat}</span>
                <div className="bar-track">
                  <div
                    className="bar-fill"
                    style={{ width: `${Math.min(100, (n / cats[0][1]) * 100)}%` }}
                  />
                </div>
                <span className="bar-n">{n}</span>
              </div>
            ))}
          </div>
        )}
      </div>

      <div className="card">
        <h3>Demand signals (last 30 days)</h3>
        <div className="scheme-grid">
          <div><span className="k">Orders nearby</span><span className="v big">{report.demand.ordersLast30d}</span></div>
          <div><span className="k">Order value</span><span className="v big">{inr(report.demand.revenueLast30d)}</span></div>
        </div>
      </div>

      <div className="card">
        <h3>Smart stocking guidance</h3>
        <ul className="guidance-list">
          {(report.guidance || []).map((g, i) => (
            <li key={i}>{g}</li>
          ))}
        </ul>
      </div>
    </div>
  )
}

const TABS = [
  { key: 'finance', label: '💰 Finance Calculator' },
  { key: 'feasibility', label: '🗺️ Feasibility Report' },
]

export default function Advisory() {
  const [tab, setTab] = useState('finance')
  return (
    <div className="page advisory-page">
      <div className="page-head">
        <h2>Advisory</h2>
        <p className="muted">Loan clarity and demand data before you bet on stock.</p>
      </div>
      <div className="tabs">
        {TABS.map((t) => (
          <button
            key={t.key}
            type="button"
            className={`tab ${tab === t.key ? 'active' : ''}`}
            onClick={() => setTab(t.key)}
          >
            {t.label}
          </button>
        ))}
      </div>
      {tab === 'finance' ? <FinanceCalculator /> : <FeasibilityReport />}
    </div>
  )
}
