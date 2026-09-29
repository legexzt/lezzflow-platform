import { useEffect, useState } from 'react'
import api from '../api.js'
import Icon from './Icon.jsx'
import { useLang } from '../LanguageContext.jsx'

/**
 * GTM cycle-3: Sarkari Yojanaen as the onboarding door-opener.
 * Real schemes only (public GET /v1/schemes) — informational + check-status
 * links, never promised loans or guaranteed approvals.
 */
export default function SchemesCard() {
  const { t } = useLang()
  const [schemes, setSchemes] = useState(null)

  useEffect(() => {
    let active = true
    api
      .get('/v1/schemes')
      .then((res) => {
        if (!active) return
        const list = Array.isArray(res.data) ? res.data : []
        setSchemes(list.slice(0, 3))
      })
      .catch(() => {
        if (active) setSchemes([])
      })
    return () => {
      active = false
    }
  }, [])

  // Loading or empty/error: render nothing — the card must never show
  // stale or invented schemes.
  if (!schemes || schemes.length === 0) return null

  return (
    <div className="card schemes-card">
      <div className="schemes-head">
        <Icon name="bank" size={20} />
        <div>
          <h3>{t('schemes_title')}</h3>
          <p className="muted small">{t('schemes_sub')}</p>
        </div>
      </div>
      <ul className="schemes-list">
        {schemes.map((s) => (
          <li key={s.id} className="scheme-item">
            <div>
              <strong>{s.title}</strong>
              {s.category && <span className="muted small"> · {s.category}</span>}
              {s.status === 'check' && (
                <span className="badge badge-amber" style={{ marginLeft: 6 }}>
                  {t('schemes_check')}
                </span>
              )}
            </div>
            {s.apply_url ? (
              <a
                href={s.apply_url}
                target="_blank"
                rel="noopener noreferrer"
                className="scheme-link"
              >
                {t('schemes_check_status')} →
              </a>
            ) : s.source_url ? (
              <a
                href={s.source_url}
                target="_blank"
                rel="noopener noreferrer"
                className="scheme-link"
              >
                {t('schemes_check_status')} →
              </a>
            ) : null}
          </li>
        ))}
      </ul>
      <p className="muted small schemes-note">{t('schemes_note')}</p>
    </div>
  )
}
