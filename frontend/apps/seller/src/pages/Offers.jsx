import { useCallback, useEffect, useState } from 'react'
import api, { getErrorMessage } from '../api.js'
import { useLang } from '../LanguageContext.jsx'
import { useToast } from '../components/Toast.jsx'
import Loading from '../components/Loading.jsx'
import Icon from '../components/Icon.jsx'

const emptyForm = {
  title: '', description: '', discount_type: 'flat',
  discount_value: '', min_order: '', valid_from: '', valid_to: '', active: true,
}

function OfferCard({ offer, onToggle, onEdit, t }) {
  const badge =
    offer.discount_type === 'percent'
      ? `${offer.discount_value}% ${t('offer_off')}`
      : `₹${offer.discount_value} ${t('offer_off')}`
  return (
    <div className={`card offer-card ${offer.active ? '' : 'inactive'}`}>
      <div className="offer-main">
        <div className="offer-badge">{badge}</div>
        <div className="offer-info">
          <div className="offer-title">{offer.title}</div>
          {offer.description && <div className="offer-desc">{offer.description}</div>}
          <div className="offer-meta">
            {Number(offer.min_order) > 0 && <span>{t('offer_min')} ₹{offer.min_order}</span>}
            {offer.valid_to && <span> · till {String(offer.valid_to).slice(0, 10)}</span>}
          </div>
        </div>
      </div>
      <div className="offer-actions">
        <button
          type="button"
          className={`switch ${offer.active ? 'on' : ''}`}
          onClick={() => onToggle(offer)}
          role="switch"
          aria-checked={offer.active}
          aria-label={t('active')}
        >
          <span className="knob" />
        </button>
        <button type="button" className="btn btn-outline btn-sm" onClick={() => onEdit(offer)}>
          <Icon name="edit" size={14} /> {t('edit')}
        </button>
      </div>
    </div>
  )
}

export default function Offers() {
  const { t } = useLang()
  const toast = useToast()
  const [shopId, setShopId] = useState(null)
  const [offers, setOffers] = useState([])
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [showForm, setShowForm] = useState(false)
  const [editing, setEditing] = useState(null)
  const [form, setForm] = useState(emptyForm)

  const load = useCallback(async () => {
    try {
      const res = await api.get('/shops?mine=true')
      const shops = Array.isArray(res.data) ? res.data : res.data?.shops || []
      const shop = shops[0]
      if (!shop) {
        setLoading(false)
        return
      }
      setShopId(shop.id)
      const ores = await api.get(`/v1/shops/${shop.id}/offers`)
      setOffers(Array.isArray(ores.data) ? ores.data : ores.data?.offers || [])
    } catch (err) {
      toast(getErrorMessage(err), 'error')
    } finally {
      setLoading(false)
    }
  }, [toast])

  useEffect(() => {
    load()
  }, [load])

  function update(field, value) {
    setForm((f) => ({ ...f, [field]: value }))
  }

  function openNew() {
    setEditing(null)
    setForm(emptyForm)
    setShowForm(true)
  }

  function openEdit(offer) {
    setEditing(offer)
    setForm({
      title: offer.title || '',
      description: offer.description || '',
      discount_type: offer.discount_type || 'flat',
      discount_value: offer.discount_value ?? '',
      min_order: offer.min_order ?? '',
      valid_from: offer.valid_from ? String(offer.valid_from).slice(0, 10) : '',
      valid_to: offer.valid_to ? String(offer.valid_to).slice(0, 10) : '',
      active: offer.active !== false,
    })
    setShowForm(true)
  }

  async function handleSubmit(e) {
    e.preventDefault()
    if (!form.title.trim()) return toast(t('offer_title') + ' — required', 'error')
    const dv = Number(form.discount_value)
    if (!Number.isFinite(dv) || dv < 0) return toast(t('discount_value') + ' — invalid', 'error')
    if (form.discount_type === 'percent' && dv > 100) return toast('Percent cannot exceed 100', 'error')

    setSaving(true)
    const payload = {
      title: form.title.trim(),
      description: form.description.trim() || null,
      discount_type: form.discount_type,
      discount_value: dv,
      min_order: form.min_order === '' ? 0 : Number(form.min_order) || 0,
      active: !!form.active,
      valid_from: form.valid_from || null,
      valid_to: form.valid_to || null,
    }
    try {
      if (editing) {
        await api.patch(`/v1/shops/${shopId}/offers/${editing.id}`, payload)
        toast(t('offer_updated'), 'success')
      } else {
        await api.post(`/v1/shops/${shopId}/offers`, payload)
        toast(t('offer_created'), 'success')
      }
      setShowForm(false)
      load()
    } catch (err) {
      toast(getErrorMessage(err), 'error')
    } finally {
      setSaving(false)
    }
  }

  async function toggleActive(offer) {
    try {
      await api.patch(`/v1/shops/${shopId}/offers/${offer.id}`, { active: !offer.active })
      setOffers((list) => list.map((o) => (o.id === offer.id ? { ...o, active: !o.active } : o)))
    } catch (err) {
      toast(getErrorMessage(err), 'error')
    }
  }

  if (loading) return <Loading />

  return (
    <div className="page">
      <div className="page-head">
        <div>
          <h1 className="page-title">{t('title_offers')}</h1>
          <p className="hint">{t('offers_sub')}</p>
        </div>
        {shopId && (
          <button type="button" className="btn btn-primary" onClick={openNew}>
            <Icon name="plus" size={16} /> {t('new_offer')}
          </button>
        )}
      </div>

      {!shopId && <div className="card"><p className="hint">Create your shop first to add offers.</p></div>}

      {shopId && offers.length === 0 && !showForm && (
        <div className="card empty-state">
          <Icon name="megaphone" size={40} />
          <p>{t('no_offers')}</p>
          <button type="button" className="btn btn-primary" onClick={openNew}>
            {t('new_offer')}
          </button>
        </div>
      )}

      {offers.map((offer) => (
        <OfferCard key={offer.id} offer={offer} onToggle={toggleActive} onEdit={openEdit} t={t} />
      ))}

      {showForm && (
        <div className="modal-overlay" onClick={() => setShowForm(false)}>
          <div className="modal" onClick={(e) => e.stopPropagation()}>
            <h2>{editing ? t('edit') : t('new_offer')}</h2>
            <form onSubmit={handleSubmit}>
              <div className="field">
                <label>{t('offer_title')}</label>
                <input
                  type="text"
                  value={form.title}
                  onChange={(e) => update('title', e.target.value)}
                  placeholder={t('offer_title_ph')}
                  required
                />
              </div>
              <div className="field">
                <label>{t('offer_desc')}</label>
                <textarea rows="2" value={form.description} onChange={(e) => update('description', e.target.value)} />
              </div>
              <div className="field-row">
                <div className="field">
                  <label>{t('discount_type')}</label>
                  <select value={form.discount_type} onChange={(e) => update('discount_type', e.target.value)}>
                    <option value="flat">{t('type_flat')}</option>
                    <option value="percent">{t('type_percent')}</option>
                  </select>
                </div>
                <div className="field">
                  <label>{t('discount_value')}</label>
                  <input
                    type="number" min="0" step="any" inputMode="decimal"
                    value={form.discount_value}
                    onChange={(e) => update('discount_value', e.target.value)}
                    required
                  />
                </div>
              </div>
              <div className="field">
                <label>{t('min_order')}</label>
                <input
                  type="number" min="0" step="any" inputMode="decimal"
                  value={form.min_order}
                  onChange={(e) => update('min_order', e.target.value)}
                  placeholder="0"
                />
              </div>
              <div className="field-row">
                <div className="field">
                  <label>{t('valid_from')}</label>
                  <input type="date" value={form.valid_from} onChange={(e) => update('valid_from', e.target.value)} />
                </div>
                <div className="field">
                  <label>{t('valid_to')}</label>
                  <input type="date" value={form.valid_to} onChange={(e) => update('valid_to', e.target.value)} />
                </div>
              </div>
              <div className="switch-row">
                <span>{t('active')}</span>
                <button
                  type="button"
                  className={`switch ${form.active ? 'on' : ''}`}
                  onClick={() => update('active', !form.active)}
                  role="switch"
                  aria-checked={form.active}
                >
                  <span className="knob" />
                </button>
              </div>
              <div className="field-row">
                <button type="button" className="btn btn-outline btn-block" onClick={() => setShowForm(false)}>
                  {t('cancel')}
                </button>
                <button type="submit" className="btn btn-primary btn-block" disabled={saving}>
                  {saving ? t('saving') : editing ? t('update') : t('create')}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  )
}
