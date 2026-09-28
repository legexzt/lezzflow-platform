/**
 * ChecklistCard — Item 2: First-week guided seller walkthrough
 * Renders on Home/Dashboard.jsx directly below the shop card.
 *
 * 5 steps:
 *   1. Add a shop photo — done when shop.photoUrl exists
 *   2. Add 10 products — done when products.length >= 10 (once done, stays done)
 *   3. Set shop timings — done when shop.openTime && shop.closeTime saved
 *   4. Try a practice order — done when shop.practiceCompletedAt is set
 *   5. Go live — done when shop.isLive is true
 *
 * Unlocking: 1-3 available from start; 4 locked until 1-3 done; 5 locked until 4 done.
 *
 * Practice order is fired through the real OrderAlertHost pipeline via
 * ctx.startPractice(). Practice orders NEVER increment nav badge or metrics.
 *
 * Pre-existing live shops: show congrats state once, then dismissible.
 */
import { useEffect, useRef, useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import api, { getErrorMessage } from '../api.js'
import { goLiveShop } from '../api/onboarding.js'
import { useToast } from './Toast.jsx'
import Icon from './Icon.jsx'
import { useAlertCtx } from './OrderAlertHost.jsx'

// ---- Progress ring SVG --------------------------------------------------
function ProgressRing({ done, total }) {
  const r = 19
  const circ = 2 * Math.PI * r
  const frac = total === 0 ? 0 : done / total
  const offset = circ * (1 - frac)
  const complete = done >= total

  return (
    <svg width="48" height="48" viewBox="0 0 48 48">
      <circle className="progress-ring track" cx="24" cy="24" r={r} strokeWidth="5" />
      <circle
        className={`progress-ring bar ${complete ? 'is-complete' : ''}`}
        cx="24" cy="24" r={r} strokeWidth="5"
        strokeDasharray={circ}
        strokeDashoffset={offset}
        style={{ transform: 'rotate(-90deg)', transformOrigin: '50% 50%' }}
      />
      <text
        x="24" y="24"
        className="progress-ring-text"
        style={{ fontSize: 12, fontWeight: 800, fill: '#1a1a1a', dominantBaseline: 'middle', textAnchor: 'middle' }}
      >
        {done}/{total}
      </text>
    </svg>
  )
}

// ---- Individual step icons -----------------------------------------------
const STEP_ICONS = ['camera', 'box', 'clock', 'bag', 'megaphone']

// ---- Go-live confirm sheet ----------------------------------------------
function GoLiveSheet({ onClose, onConfirm, busy }) {
  return (
    <>
      <div className="sheet-scrim" onClick={onClose} />
      <div className="sheet" role="dialog" aria-modal="true">
        <div className="sheet-handle" />
        <p className="sheet-title">Go live?</p>
        <p style={{ fontSize: 14, color: 'var(--muted)', margin: '8px 0 20px', lineHeight: 1.4 }}>
          Customers near you will see your shop and can place orders. You can turn this off anytime from More &rarr; Shop.
        </p>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
          <button type="button" className="btn btn-primary btn-block" style={{ height: 52 }} onClick={onConfirm} disabled={busy}>
            {busy ? 'Going live…' : 'Go live'}
          </button>
          <button type="button" className="alert-tertiary" onClick={onClose}>Not yet</button>
        </div>
      </div>
    </>
  )
}

// ---- Locked go-live sheet -----------------------------------------------
function LockedGoLiveSheet({ onClose, step4Unlocked }) {
  return (
    <>
      <div className="sheet-scrim" onClick={onClose} />
      <div className="sheet" role="dialog" aria-modal="true">
        <div className="sheet-handle" />
        <p className="sheet-title">One step left</p>
        <p style={{ fontSize: 14, color: 'var(--muted)', margin: '8px 0 20px', lineHeight: 1.4 }}>
          Finish the practice order (step 4) and your shop can go live. Going live means customers near you can see your shop and place orders. Until then, your shop stays hidden — even if the Open switch is on.
        </p>
        <button type="button" className="btn btn-outline btn-block" onClick={onClose}>
          {step4Unlocked ? 'Start practice' : 'Got it'}
        </button>
      </div>
    </>
  )
}

// ---- End practice confirm (used inside OrderAlertHost via window.confirm,
//      but we also show an inline "End practice" text link on the checklist)

// =========================================================================
export default function ChecklistCard({ shop, productCount, onGoLive }) {
  const toast = useToast()
  const navigate = useNavigate()
  const alertCtx = useAlertCtx()
  const [dismissed, setDismissed] = useState(() => {
    try { return localStorage.getItem('lf_checklist_dismissed') === 'true' } catch { return false }
  })
  const [goLiveSheet, setGoLiveSheet] = useState(false)
  const [lockedSheet, setLockedSheet] = useState(false)
  const [goLiveBusy, setGoLiveBusy] = useState(false)
  const [practiceInlineOpen, setPracticeInlineOpen] = useState(false)
  // Track product-10-done (once done, never un-done)
  const [productsDoneSticky, setProductsDoneSticky] = useState(() => {
    try { return localStorage.getItem('lf_products_done') === 'true' } catch { return false }
  })
  const checklistRef = useRef(null)

  // Derived flags
  const step1Done = Boolean(shop?.photoUrl || shop?.photo_url)
  const step2Done = productsDoneSticky || productCount >= 10
  const step3Done = Boolean(shop?.openTime || shop?.open_time) && Boolean(shop?.closeTime || shop?.close_time)
  let practiceStored = null
  let isLiveStored = null
  try {
    practiceStored = localStorage.getItem('lf_practice_completed_at')
    isLiveStored = localStorage.getItem('lf_is_live')
  } catch {}
  const step4Done = Boolean(shop?.practiceCompletedAt || shop?.practice_completed_at || practiceStored)
  const step5Done = Boolean(shop?.isLive || shop?.is_live || isLiveStored === 'true')

  // Sticky product-done flag
  useEffect(() => {
    if (productCount >= 10 && !productsDoneSticky) {
      setProductsDoneSticky(true)
      try { localStorage.setItem('lf_products_done', 'true') } catch {}
    }
  }, [productCount, productsDoneSticky])

  // Dismissed: pre-existing live sellers see congrats once, then dismiss
  if (dismissed) return null

  const doneCount = [step1Done, step2Done, step3Done, step4Done, step5Done].filter(Boolean).length
  const allDone = doneCount === 5

  // Unlocking rules
  const steps123Done = step1Done && step2Done && step3Done
  const step4Unlocked = steps123Done
  const step5Unlocked = step4Done

  // Current step (first incomplete in order 1→5)
  function isCurrent(idx) {
    if (allDone) return false
    const doneArr = [step1Done, step2Done, step3Done, step4Done, step5Done]
    const avail = [true, true, true, step4Unlocked, step5Unlocked]
    for (let i = 0; i < 5; i++) {
      if (!doneArr[i] && avail[i]) return i === idx
    }
    return false
  }

  async function confirmGoLive() {
    setGoLiveBusy(true)
    try {
      const shopRes = await api.get('/shops?mine=true')
      const shops = Array.isArray(shopRes.data) ? shopRes.data : shopRes.data?.shops || []
      const s = shops[0]
      if (s) {
        const updated = await goLiveShop(s.id)
        if (updated?.already_live) {
          toast('Your shop is already live.', 'info')
        } else {
          toast("You're live. Customers can now see your shop.", 'success')
        }
        setGoLiveSheet(false)
        if (onGoLive) onGoLive()
        try {
          localStorage.setItem('lf_is_live', 'true')
        } catch (_) {}
      }
    } catch (err) {
      const reasons = err?.response?.data?.reasons
      if (err?.response?.status === 422 && Array.isArray(reasons) && reasons.length) {
        toast('Not ready yet: ' + reasons.join('; '), 'error')
      } else {
        toast(getErrorMessage(err, 'Could not go live — try again.'), 'error')
      }
    } finally {
      setGoLiveBusy(false)
    }
  }

  function handleStepClick(idx) {
    if (idx === 3) { // Step 4: practice
      if (!step4Unlocked) {
        toast('Finish "Set shop timings" first', 'info')
        return
      }
      if (step4Done) return
      setPracticeInlineOpen(true)
      return
    }
    if (idx === 4) { // Step 5: go live
      if (!step5Unlocked) { setLockedSheet(true); return }
      if (step5Done) return
      setGoLiveSheet(true)
      return
    }
    // Steps 1-3 navigate to existing screens
    const paths = ['/shop', '/products/new', '/shop']
    navigate(paths[idx])
  }

  function handleBeginPractice() {
    setPracticeInlineOpen(false)
    alertCtx?.startPractice?.()
  }

  function dismissCard() {
    try { localStorage.setItem('lf_checklist_dismissed', 'true') } catch {}
    setDismissed(true)
  }

  // ---- Congrats / all-done state -----------------------------------------
  if (allDone) {
    return (
      <div className="card checklist-card">
        <div className="checklist-header">
          <ProgressRing done={5} total={5} />
          <div style={{ flex: 1 }}>
            <div style={{ fontSize: 16, fontWeight: 800 }}>You're all set</div>
          </div>
        </div>
        <p className="checklist-done-body">Your shop is live. New orders will ring on this phone.</p>
        <button type="button" className="btn btn-primary btn-block" onClick={dismissCard}>Done</button>
      </div>
    )
  }

  const stepDefs = [
    { label: 'Add a shop photo', helper: step1Done ? 'Done' : 'Customers can see what your shop looks like', done: step1Done, locked: false },
    { label: 'Add 10 products', helper: step2Done ? 'Done' : `${productCount}/10 added`, done: step2Done, locked: false },
    { label: 'Set shop timings', helper: step3Done ? 'Done' : 'So customers know when you\'re open', done: step3Done, locked: false },
    { label: 'Try a practice order', helper: step4Done ? 'Done' : 'Learn with a fake order — no real customer', done: step4Done, locked: !step4Unlocked },
    { label: 'Go live', helper: step5Done ? 'Done' : step5Unlocked ? 'Customers can find your shop and order' : 'Finish the practice order to unlock', done: step5Done, locked: !step5Unlocked },
  ]

  return (
    <>
      <div className="card checklist-card" ref={checklistRef}>
        <div className="checklist-header">
          <ProgressRing done={doneCount} total={5} />
          <div style={{ flex: 1 }}>
            <div style={{ fontSize: 16, fontWeight: 800 }}>Set up your shop</div>
            <div style={{ fontSize: 13, color: 'var(--muted)' }}>{doneCount} of 5 done</div>
          </div>
        </div>

        <div className="step-rows">
          {stepDefs.map((step, idx) => {
            const current = isCurrent(idx)
            const isPracticeStep = idx === 3

            return (
              <div key={idx}>
                <div
                  className={`step-row ${step.locked ? 'is-locked' : ''}`}
                  onClick={() => !step.done && handleStepClick(idx)}
                  style={{ cursor: step.done || step.locked ? 'default' : 'pointer' }}
                  role="button"
                  tabIndex={step.done || step.locked ? -1 : 0}
                  onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') handleStepClick(idx) }}
                  aria-label={step.label}
                >
                  <div className="step-icon-box">
                    <Icon name={STEP_ICONS[idx]} size={20} />
                  </div>
                  <div className="step-row-main">
                    <div className="step-label" style={{ color: step.locked ? 'var(--muted)' : 'var(--ink)' }}>
                      {step.label}
                    </div>
                    <div className="step-helper">{step.helper}</div>
                  </div>
                  {step.done ? (
                    <div className="step-done">
                      <Icon name="check" size={14} style={{ stroke: '#fff' }} />
                    </div>
                  ) : step.locked ? (
                    <Icon name="lock" size={16} style={{ color: '#bbbbbb' }} />
                  ) : current ? (
                    <button
                      type="button"
                      className="btn btn-sm btn-primary"
                      onClick={(e) => { e.stopPropagation(); handleStepClick(idx) }}
                    >
                      {isPracticeStep ? (step.done ? 'Done' : 'Start practice') : 'Start'}
                    </button>
                  ) : (
                    <button
                      type="button"
                      className="btn btn-sm btn-outline"
                      onClick={(e) => { e.stopPropagation(); handleStepClick(idx) }}
                    >
                      Start
                    </button>
                  )}
                </div>

                {/* Practice step inline expansion */}
                {isPracticeStep && practiceInlineOpen && !step4Done && (
                  <div className="practice-inline-expand">
                    A fake order will ring on this phone, exactly like a real one. Nothing reaches any customer.
                    <div style={{ marginTop: 8 }}>
                      <button type="button" className="btn btn-sm btn-primary" onClick={handleBeginPractice}>
                        Begin
                      </button>
                    </div>
                  </div>
                )}

                {/* Practice again link on done row */}
                {isPracticeStep && step4Done && (
                  <div style={{ paddingLeft: 48, paddingBottom: 8 }}>
                    <button type="button" className="alert-tertiary" style={{ fontSize: 12, textAlign: 'left' }} onClick={() => alertCtx?.startPractice?.()}>
                      Practice again
                    </button>
                  </div>
                )}
              </div>
            )
          })}
        </div>
      </div>

      {goLiveSheet && (
        <GoLiveSheet
          onClose={() => setGoLiveSheet(false)}
          onConfirm={confirmGoLive}
          busy={goLiveBusy}
        />
      )}
      {lockedSheet && (
        <LockedGoLiveSheet
          onClose={() => setLockedSheet(false)}
          step4Unlocked={step4Unlocked}
        />
      )}
    </>
  )
}
