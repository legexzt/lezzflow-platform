/**
 * KhataSection — Item 3: Customer credit ledger on the Money page
 *
 * Backend endpoints preferred: GET/POST /khata/customers, GET/POST /khata/entries.
 * If endpoints return 404/405, falls back to localStorage (lf_khata_v1).
 *
 * TODO: Replace localStorage fallback with real backend once /khata/* endpoints
 * are deployed. A ledger must survive device changes — localStorage is v1 only.
 *
 * Data model:
 *   customers: [{ id, name, phone?, createdAt }]
 *   entries:   [{ id, customerId, type: 'credit'|'payment', amount, method, note, date, createdAt }]
 *   meta:      { snoozedUntil?, lastRemindedAt? }
 *
 * Derived: balance(cid) = sum(credit) - sum(payment).
 * Running balance per entry: computed oldest→newest; entries rendered newest-first.
 * Overpayment: allowed, shown as ADVANCE (negative balance). Never blocked.
 * No edit/delete of entries in v1.
 */
import { useEffect, useState, useRef, useCallback } from 'react'
import api, { getErrorMessage } from '../api.js'
import { useToast } from './Toast.jsx'
import Icon from './Icon.jsx'

// ---- localStorage fallback key ------------------------------------------
const LS_KEY = 'lf_khata_v1'

function lsRead() {
  try {
    const v = localStorage.getItem(LS_KEY)
    if (!v) return { customers: [], entries: [], meta: { snoozedUntil: null, lastRemindedAt: null } }
    return JSON.parse(v)
  } catch {
    return { customers: [], entries: [], meta: { snoozedUntil: null, lastRemindedAt: null } }
  }
}

function lsWrite(data) {
  try { localStorage.setItem(LS_KEY, JSON.stringify(data)) } catch {}
}

// ---- Try backend, fall back to localStorage -----------------------------
async function fetchKhata() {
  try {
    const [custRes, entRes] = await Promise.all([
      api.get('/khata/customers'),
      api.get('/khata/entries'),
    ])
    const customers = Array.isArray(custRes.data) ? custRes.data : custRes.data?.customers || []
    const entries = Array.isArray(entRes.data) ? entRes.data : entRes.data?.entries || []
    let meta = { snoozedUntil: null, lastRemindedAt: null }
    try { const mr = await api.get('/khata/meta'); meta = mr.data || meta } catch {}
    return { customers, entries, meta, usingBackend: true }
  } catch (err) {
    // Fall back to localStorage
    const data = lsRead()
    return { ...data, usingBackend: false }
  }
}

// ---- Helpers -------------------------------------------------------------
function genId() { return Date.now().toString(36) + Math.random().toString(36).slice(2) }

function toYMD(d) {
  const dt = d ? new Date(d) : new Date()
  return dt.toISOString().slice(0, 10)
}

function todayYMD() { return toYMD(null) }

function fmtDate(dateStr) {
  if (!dateStr) return ''
  try {
    const d = new Date(dateStr)
    return d.toLocaleDateString('en-IN', { day: 'numeric', month: 'short' })
  } catch { return dateStr }
}

function initials(name = '') {
  const words = name.trim().split(/\s+/).filter(Boolean)
  if (words.length === 0) return '?'
  if (words.length === 1) return words[0].charAt(0).toUpperCase()
  return (words[0].charAt(0) + words[1].charAt(0)).toUpperCase()
}

function matchName(existingName, inputName) {
  return existingName.trim().toLowerCase() === inputName.trim().toLowerCase()
}

function computeBalance(entries, customerId) {
  let bal = 0
  for (const e of entries.filter((e) => e.customerId === customerId)) {
    if (e.type === 'credit') bal += Number(e.amount)
    else bal -= Number(e.amount)
  }
  return Math.round(bal * 100) / 100
}

function getLastActivity(entries, customerId) {
  const ces = entries.filter((e) => e.customerId === customerId)
  if (ces.length === 0) return null
  ces.sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt))
  return ces[0].createdAt
}

function runningBalances(entries, customerId) {
  // oldest→newest, compute running balance
  const ces = entries
    .filter((e) => e.customerId === customerId)
    .sort((a, b) => new Date(a.createdAt) - new Date(b.createdAt))
  let bal = 0
  return ces.map((e) => {
    if (e.type === 'credit') bal += Number(e.amount)
    else bal -= Number(e.amount)
    return { ...e, runningBal: Math.round(bal * 100) / 100 }
  })
}

// ---- BalanceDisplay ------------------------------------------------------
function BalanceDisplay({ bal }) {
  if (bal > 0) return (
    <div className="khata-balance is-due">
      <span>₹{Math.abs(bal).toLocaleString('en-IN', { maximumFractionDigits: 2 })}</span>
      <span className="lbl">DUE</span>
    </div>
  )
  if (bal === 0) return (
    <div className="khata-balance is-settled">
      <span>₹0</span>
      <span className="lbl" style={{ color: '#9a9a9a' }}>SETTLED</span>
    </div>
  )
  return (
    <div className="khata-balance is-advance">
      <span>₹{Math.abs(bal).toLocaleString('en-IN', { maximumFractionDigits: 2 })}</span>
      <span className="lbl">ADVANCE</span>
    </div>
  )
}

// ---- AddCreditSheet ------------------------------------------------------
function AddCreditSheet({ customers, prefillCustomer, onClose, onSave }) {
  const [name, setName] = useState(prefillCustomer?.name || '')
  const [phone, setPhone] = useState(prefillCustomer?.phone || '')
  const [amount, setAmount] = useState('')
  const [note, setNote] = useState('')
  const [date, setDate] = useState(todayYMD())
  const [saving, setSaving] = useState(false)
  const [err, setErr] = useState('')
  const amountRef = useRef(null)

  useEffect(() => {
    const t = setTimeout(() => amountRef.current?.focus(), 350)
    return () => clearTimeout(t)
  }, [])

  async function handleSave() {
    if (!name.trim()) { setErr("Enter the customer's name."); return }
    const amt = parseFloat(amount)
    if (!amount || isNaN(amt) || amt <= 0) { setErr('Enter an amount greater than ₹0.'); return }
    if (date > todayYMD()) { setErr("Date can't be in the future."); return }
    setSaving(true)
    try {
      await onSave({ name: name.trim(), phone: phone.trim(), amount: amt, note: note.trim(), date })
      onClose()
    } catch (e) {
      setErr("Couldn't save — check your connection and try again.")
    } finally {
      setSaving(false)
    }
  }

  return (
    <>
      <div className="sheet-scrim" onClick={onClose} />
      <div className="sheet" role="dialog" aria-modal="true">
        <div className="sheet-handle" />
        <p className="sheet-title">Add credit</p>
        {err && <p style={{ color: 'var(--danger)', fontSize: 13, margin: '4px 0' }}>{err}</p>}
        <div style={{ display: 'flex', flexDirection: 'column', gap: 12, marginTop: 12 }}>
          <div className="field">
            <label>Customer name *</label>
            <input
              type="text"
              list="khata-names"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="Customer name"
              autoFocus={!prefillCustomer}
            />
            <datalist id="khata-names">
              {customers.map((c) => <option key={c.id} value={c.name} />)}
            </datalist>
          </div>
          <div className="field">
            <label>Phone (optional)</label>
            <input type="text" inputMode="tel" value={phone} onChange={(e) => setPhone(e.target.value)} placeholder="Phone number" />
          </div>
          <div className="field">
            <label>Amount (₹) *</label>
            <input
              ref={amountRef}
              type="number"
              inputMode="decimal"
              min="0"
              step="0.01"
              value={amount}
              onChange={(e) => setAmount(e.target.value)}
              placeholder="0"
            />
          </div>
          <div className="field">
            <label>Note (optional)</label>
            <input type="text" value={note} onChange={(e) => setNote(e.target.value)} placeholder="e.g. Milk + bread" />
          </div>
          <div className="field">
            <label>Date</label>
            <input type="date" value={date} max={todayYMD()} onChange={(e) => setDate(e.target.value)} />
          </div>
        </div>
        <div className="sheet-actions">
          <button type="button" className="btn btn-outline" onClick={onClose} disabled={saving}>Cancel</button>
          <button type="button" className="btn btn-primary" style={{ flex: 1 }} onClick={handleSave} disabled={saving}>
            {saving ? 'Saving…' : 'Save credit'}
          </button>
        </div>
      </div>
    </>
  )
}

// ---- RecordPaymentSheet --------------------------------------------------
function RecordPaymentSheet({ customer, balance, onClose, onSave }) {
  const [amount, setAmount] = useState(balance > 0 ? String(balance) : '')
  const [method, setMethod] = useState('cash')
  const [note, setNote] = useState('')
  const [saving, setSaving] = useState(false)
  const [err, setErr] = useState('')
  const amountRef = useRef(null)

  useEffect(() => {
    const t = setTimeout(() => { amountRef.current?.focus(); amountRef.current?.select() }, 350)
    return () => clearTimeout(t)
  }, [])

  const amt = parseFloat(amount) || 0
  const overPay = balance > 0 && amt > balance

  async function handleSave() {
    if (!amount || isNaN(amt) || amt <= 0) { setErr('Enter an amount greater than ₹0.'); return }
    setSaving(true)
    try {
      await onSave({ amount: amt, method, note: note.trim() })
      onClose()
    } catch {
      setErr("Couldn't save — check your connection and try again.")
    } finally {
      setSaving(false)
    }
  }

  return (
    <>
      <div className="sheet-scrim" onClick={onClose} />
      <div className="sheet" role="dialog" aria-modal="true">
        <div className="sheet-handle" />
        <p className="sheet-title">Record payment</p>
        <p className="sheet-sub">
          {balance > 0
            ? `${customer.name} currently owes ₹${balance.toLocaleString('en-IN', { maximumFractionDigits: 2 })}`
            : balance < 0
              ? `${customer.name} has ₹${Math.abs(balance).toLocaleString('en-IN', { maximumFractionDigits: 2 })} advance`
              : `${customer.name} is settled`
          }
        </p>
        {err && <p style={{ color: 'var(--danger)', fontSize: 13, margin: '4px 0' }}>{err}</p>}
        <div style={{ display: 'flex', flexDirection: 'column', gap: 12, marginTop: 12 }}>
          <div className="field">
            <label>Amount (₹) *</label>
            <input
              ref={amountRef}
              type="number"
              inputMode="decimal"
              min="0"
              step="0.01"
              value={amount}
              onChange={(e) => setAmount(e.target.value)}
              placeholder="0"
            />
            {balance > 0 && <p className="hint">Full due is pre-filled — edit if partial.</p>}
          </div>
          {overPay && (
            <p className="khata-live-warn">
              This is ₹{(amt - balance).toLocaleString('en-IN', { maximumFractionDigits: 2 })} more than the due — the extra will show as advance for {customer.name}.
            </p>
          )}
          <div>
            <label style={{ fontSize: 13, fontWeight: 600, display: 'block', marginBottom: 8 }}>Method</label>
            <div className="tabs">
              {['cash', 'upi'].map((m) => (
                <button key={m} type="button" className={`tab ${method === m ? 'active' : ''}`} onClick={() => setMethod(m)}>
                  {m === 'cash' ? 'Cash' : 'UPI'}
                </button>
              ))}
            </div>
          </div>
          <div className="field">
            <label>Note (optional)</label>
            <input type="text" value={note} onChange={(e) => setNote(e.target.value)} placeholder="Optional note" />
          </div>
        </div>
        <div className="sheet-actions">
          <button type="button" className="btn btn-outline" onClick={onClose} disabled={saving}>Cancel</button>
          <button type="button" className="btn btn-primary" style={{ flex: 1 }} onClick={handleSave} disabled={saving}>
            {saving ? 'Saving…' : 'Save payment'}
          </button>
        </div>
      </div>
    </>
  )
}

// =========================================================================
export default function KhataSection() {
  const toast = useToast()
  const [loading, setLoading] = useState(true)
  const [loadError, setLoadError] = useState(null)
  const [usingBackend, setUsingBackend] = useState(false)
  const [customers, setCustomers] = useState([])
  const [entries, setEntries] = useState([])
  const [meta, setMeta] = useState({ snoozedUntil: null, lastRemindedAt: null })
  const [openId, setOpenId] = useState(null) // expanded customer ID
  const [flashId, setFlashId] = useState(null)
  const [addSheet, setAddSheet] = useState(null) // null | { prefill?: customer }
  const [paySheet, setPaySheet] = useState(null) // null | { customer }

  const load = useCallback(async () => {
    setLoading(true)
    setLoadError(null)
    try {
      const data = await fetchKhata()
      setCustomers(data.customers)
      setEntries(data.entries)
      setMeta(data.meta || { snoozedUntil: null, lastRemindedAt: null })
      setUsingBackend(data.usingBackend)
    } catch (err) {
      setLoadError(getErrorMessage(err, "Couldn't load khata — pull to refresh or try again."))
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => { load() }, [load])

  // ---- Persist to LS (v1 fallback) or backend ----------------------------
  async function persist(newData) {
    if (usingBackend) return // backend is source of truth
    lsWrite({ customers: newData.customers ?? customers, entries: newData.entries ?? entries, meta: newData.meta ?? meta })
  }

  // ---- Save credit -------------------------------------------------------
  async function handleSaveCredit({ name, phone, amount, note, date }) {
    // Match existing customer (trim + case-insensitive)
    let cust = customers.find((c) => matchName(c.name, name))
    if (!cust) {
      cust = { id: genId(), name: name.trim(), phone: phone || null, createdAt: new Date().toISOString() }
      const newCustomers = [...customers, cust]

      if (usingBackend) {
        try {
          const res = await api.post('/khata/customers', { name: cust.name, phone: cust.phone })
          cust = res.data?.customer || cust
        } catch { throw new Error('save-failed') }
      }

      setCustomers(newCustomers)
      persist({ customers: newCustomers })
    } else {
      // Update phone if provided
      if (phone && phone !== cust.phone) {
        const updated = customers.map((c) => c.id === cust.id ? { ...c, phone } : c)
        setCustomers(updated)
        persist({ customers: updated })
        if (usingBackend) {
          try { await api.put(`/khata/customers/${cust.id}`, { phone }) } catch {}
        }
      }
    }

    const entry = {
      id: genId(),
      customerId: cust.id,
      type: 'credit',
      amount,
      method: null,
      note: note || '',
      date,
      createdAt: new Date().toISOString(),
    }

    if (usingBackend) {
      try {
        const res = await api.post('/khata/entries', entry)
        const saved = res.data?.entry || entry
        const newEntries = [...entries, saved]
        setEntries(newEntries)
      } catch { throw new Error('save-failed') }
    } else {
      const newEntries = [...entries, entry]
      setEntries(newEntries)
      persist({ entries: newEntries })
    }

    const newBal = computeBalance([...entries, entry], cust.id)
    const balFmt = newBal < 0
      ? `₹${Math.abs(newBal).toLocaleString('en-IN', { maximumFractionDigits: 2 })} advance`
      : `₹${newBal.toLocaleString('en-IN', { maximumFractionDigits: 2 })}`
    toast(
      newBal < 0
        ? `Credit added — ${cust.name} has ${balFmt}`
        : `Credit added — ${cust.name} now owes ${balFmt}`,
      'success'
    )
    setOpenId(cust.id)
    setFlashId(cust.id)
    setTimeout(() => setFlashId(null), 1800)
  }

  // ---- Save payment -------------------------------------------------------
  async function handleSavePayment(customer, { amount, method, note }) {
    const entry = {
      id: genId(),
      customerId: customer.id,
      type: 'payment',
      amount,
      method,
      note: note || '',
      date: todayYMD(),
      createdAt: new Date().toISOString(),
    }

    if (usingBackend) {
      try {
        const res = await api.post('/khata/entries', entry)
        const saved = res.data?.entry || entry
        const newEntries = [...entries, saved]
        setEntries(newEntries)
      } catch { throw new Error('save-failed') }
    } else {
      const newEntries = [...entries, entry]
      setEntries(newEntries)
      persist({ entries: newEntries })
    }

    const newBal = computeBalance([...entries, entry], customer.id)
    let msg
    if (newBal > 0) msg = `Payment recorded — ${customer.name} now owes ₹${newBal.toLocaleString('en-IN', { maximumFractionDigits: 2 })}`
    else if (newBal < 0) msg = `Payment recorded — ₹${Math.abs(newBal).toLocaleString('en-IN', { maximumFractionDigits: 2 })} advance for ${customer.name}`
    else msg = `Payment recorded — ${customer.name} is settled`
    toast(msg, 'success')
    setOpenId(customer.id)
    setFlashId(customer.id)
    setTimeout(() => setFlashId(null), 1800)
  }

  // ---- Reminder actions --------------------------------------------------
  async function handleRemind() {
    const today = todayYMD()
    const snoozed = toYMD(new Date(Date.now() + 7 * 86400000))
    const newMeta = { ...meta, lastRemindedAt: today, snoozedUntil: snoozed }
    setMeta(newMeta)
    persist({ meta: newMeta })
    if (usingBackend) { try { await api.put('/khata/meta', newMeta) } catch {} }
    toast('Marked as reminded', 'success')
  }

  async function handleSnooze() {
    const snoozed = toYMD(new Date(Date.now() + 7 * 86400000))
    const newMeta = { ...meta, snoozedUntil: snoozed }
    setMeta(newMeta)
    persist({ meta: newMeta })
    if (usingBackend) { try { await api.put('/khata/meta', newMeta) } catch {} }
  }

  // ---- Derived data -------------------------------------------------------
  // Customers sorted: balance desc (positive dues first), tie → most recent activity
  const customerRows = customers
    .filter((c) => entries.some((e) => e.customerId === c.id)) // only customers with entries
    .map((c) => ({
      ...c,
      balance: computeBalance(entries, c.id),
      lastActivity: getLastActivity(entries, c.id),
    }))
    .sort((a, b) => {
      if (b.balance !== a.balance) return b.balance - a.balance
      const da = a.lastActivity ? new Date(a.lastActivity).getTime() : 0
      const db = b.lastActivity ? new Date(b.lastActivity).getTime() : 0
      return db - da
    })

  const totalOutstanding = customerRows.reduce((s, c) => s + Math.max(c.balance, 0), 0)
  const today = todayYMD()
  const snoozedUntil = meta?.snoozedUntil
  const showReminder = totalOutstanding > 0 && (!snoozedUntil || today >= snoozedUntil)

  // ---- Render skeleton ----------------------------------------------------
  if (loading) {
    return (
      <div className="khata-section">
        <div className="khata-head">
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <Icon name="book" size={18} style={{ color: 'var(--green)' }} />
            <span style={{ fontSize: 16, fontWeight: 700 }}>Khata — customer credit</span>
          </div>
        </div>
        <div className="card khata-list" style={{ padding: 14, marginTop: 12 }}>
          {[0, 1, 2].map((i) => (
            <div key={i} className="skeleton" style={{ display: 'flex', gap: 10, padding: '12px 0', borderTop: i > 0 ? '1px solid #f0f0f0' : 'none' }}>
              <div style={{ width: 36, height: 36, borderRadius: '50%', background: '#eee' }} />
              <div style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: 6 }}>
                <div style={{ height: 12, width: '60%', borderRadius: 6, background: '#eee' }} />
                <div style={{ height: 10, width: '40%', borderRadius: 6, background: '#eee' }} />
              </div>
            </div>
          ))}
        </div>
      </div>
    )
  }

  // ---- Render load error --------------------------------------------------
  if (loadError) {
    return (
      <div className="khata-section">
        <div className="khata-head">
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <Icon name="book" size={18} style={{ color: 'var(--green)' }} />
            <span style={{ fontSize: 16, fontWeight: 700 }}>Khata — customer credit</span>
          </div>
        </div>
        <div className="card" style={{ marginTop: 12 }}>
          <p style={{ color: 'var(--danger)', fontSize: 14, margin: '0 0 10px' }}>{loadError}</p>
          <button type="button" className="btn btn-outline btn-sm" onClick={load}>Retry</button>
        </div>
      </div>
    )
  }

  // ---- Render empty state -------------------------------------------------
  if (customerRows.length === 0) {
    return (
      <div className="khata-section">
        <div className="khata-head">
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <Icon name="book" size={18} style={{ color: 'var(--green)' }} />
            <span style={{ fontSize: 16, fontWeight: 700 }}>Khata — customer credit</span>
          </div>
          <button type="button" className="btn btn-primary btn-sm" onClick={() => setAddSheet({})}>
            <Icon name="plus" size={14} /> Add credit
          </button>
        </div>
        <div className="khata-empty">
          <Icon name="book" size={32} style={{ color: '#c9c9c9' }} />
          <p style={{ fontSize: 14, fontWeight: 700, margin: 0 }}>No credit entries yet</p>
          <p style={{ fontSize: 13, color: 'var(--muted)', margin: 0 }}>When a regular customer buys on credit, add it here so you never lose track.</p>
          <button type="button" className="btn btn-primary btn-sm" onClick={() => setAddSheet({})}>Add credit</button>
        </div>

        {addSheet && (
          <AddCreditSheet
            customers={customers}
            prefillCustomer={addSheet.prefill}
            onClose={() => setAddSheet(null)}
            onSave={handleSaveCredit}
          />
        )}
      </div>
    )
  }

  // ---- Main render --------------------------------------------------------
  return (
    <div className="khata-section">
      {/* Section header */}
      <div className="khata-head">
        <div style={{ flex: 1 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <Icon name="book" size={18} style={{ color: 'var(--green)' }} />
            <span style={{ fontSize: 16, fontWeight: 700 }}>Khata — customer credit</span>
          </div>
          {customerRows.length > 0 && (
            <div className="khata-summary">
              Total outstanding <b>₹{totalOutstanding.toLocaleString('en-IN', { maximumFractionDigits: 2 })}</b>
              {' · '}{customerRows.length} customer{customerRows.length !== 1 ? 's' : ''}
              {meta?.lastRemindedAt && ` · Last reminded ${fmtDate(meta.lastRemindedAt)}`}
            </div>
          )}
        </div>
        <button type="button" className="btn btn-primary btn-sm" onClick={() => setAddSheet({})}>
          <Icon name="plus" size={14} /> Add credit
        </button>
      </div>

      {/* Weekly reminder card */}
      {showReminder && (
        <div className="card khata-reminder">
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <Icon name="bell" size={18} style={{ color: 'var(--amber)' }} />
            <span style={{ fontSize: 15, fontWeight: 700 }}>
              ₹{totalOutstanding.toLocaleString('en-IN', { maximumFractionDigits: 2 })} is out on credit
            </span>
          </div>
          <p style={{ fontSize: 13, color: 'var(--muted)', margin: '4px 0 0' }}>
            {customerRows.filter((c) => c.balance > 0).length} customers have credit pending. A quick word at the counter is usually enough to settle up.
          </p>
          <div className="khata-reminder-actions">
            <button type="button" className="btn btn-primary btn-sm" onClick={handleRemind}>Mark as reminded</button>
            <button type="button" className="btn btn-outline btn-sm" onClick={handleSnooze}>Not now</button>
          </div>
        </div>
      )}

      {/* Customer list */}
      <div className="khata-list">
        {customerRows.map((cust) => {
          const isOpen = openId === cust.id
          const isFlagged = flashId === cust.id
          const withBal = runningBalances(entries, cust.id).reverse() // newest first

          return (
            <div key={cust.id} className={isFlagged ? 'khata-flash' : ''}>
              <button
                type="button"
                className="khata-row"
                aria-expanded={isOpen}
                onClick={() => setOpenId(isOpen ? null : cust.id)}
              >
                <div className="khata-avatar">{initials(cust.name)}</div>
                <div style={{ minWidth: 0 }}>
                  <div className="khata-name">{cust.name}</div>
                  <div className="khata-meta">
                    Last activity: {fmtDate(cust.lastActivity)}
                    {cust.phone ? ` · ${cust.phone}` : ''}
                  </div>
                </div>
                <BalanceDisplay bal={cust.balance} />
                <Icon
                  name="chevron_down"
                  size={18}
                  className={`khata-chevron ${isOpen ? 'open' : ''}`}
                />
              </button>

              {isOpen && (
                <div className="khata-entries">
                  {withBal.map((e) => (
                    <div key={e.id} className="khata-entry">
                      <span style={{ color: 'var(--muted)', fontSize: 12 }}>{fmtDate(e.date)}</span>
                      <span>
                        {e.note || (e.type === 'credit' ? 'Credit' : 'Payment')}
                        {e.type === 'payment' && e.method && (
                          <span className={`badge ${e.method === 'cash' ? 'badge-grey' : 'badge-blue'}`} style={{ marginLeft: 6, fontSize: 11 }}>
                            {e.method === 'cash' ? 'Cash' : 'UPI'}
                          </span>
                        )}
                      </span>
                      <div>
                        <div className={`amt ${e.type}`}>
                          {e.type === 'credit' ? '+' : '−'}₹{Number(e.amount).toLocaleString('en-IN', { maximumFractionDigits: 2 })}
                        </div>
                        <div className="bal">
                          Bal ₹{Math.abs(e.runningBal).toLocaleString('en-IN', { maximumFractionDigits: 2 })}
                          {e.runningBal < 0 ? ' adv' : ''}
                        </div>
                      </div>
                    </div>
                  ))}
                  <div className="khata-entry-actions">
                    <button
                      type="button"
                      className="btn btn-outline btn-sm"
                      onClick={() => setPaySheet({ customer: cust, balance: cust.balance })}
                    >
                      Record payment
                    </button>
                    <button
                      type="button"
                      className="btn btn-outline btn-sm"
                      onClick={() => setAddSheet({ prefill: cust })}
                    >
                      Add credit
                    </button>
                  </div>
                </div>
              )}
            </div>
          )
        })}
      </div>

      {/* Sheets */}
      {addSheet && (
        <AddCreditSheet
          customers={customers}
          prefillCustomer={addSheet.prefill}
          onClose={() => setAddSheet(null)}
          onSave={handleSaveCredit}
        />
      )}
      {paySheet && (
        <RecordPaymentSheet
          customer={paySheet.customer}
          balance={paySheet.balance}
          onClose={() => setPaySheet(null)}
          onSave={(data) => handleSavePayment(paySheet.customer, data)}
        />
      )}
    </div>
  )
}
