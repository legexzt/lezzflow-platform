const crypto = require('crypto');
const { query } = require('../db');

const PARTNER_LEGAL_TRANSITIONS = {
  requested: ['accepted'],
  accepted: ['picked', 'cancelled'],
  picked: ['delivered'],
};

function isValidDeliveryStatusTransition(currentStatus, targetStatus) {
  const allowed = PARTNER_LEGAL_TRANSITIONS[currentStatus];
  if (!allowed) return false;
  return allowed.includes(targetStatus);
}

/**
 * Append-only backend-verified trip event log (migration 017).
 * Fire-and-forget: logging must never break the trip flow itself.
 */
async function logDeliveryEvent(deliveryRequestId, partnerId, event, meta) {
  try {
    await query(
      `INSERT INTO delivery_events (delivery_request_id, partner_id, event, meta)
       VALUES ($1, $2, $3, $4)`,
      [deliveryRequestId, partnerId, event, meta ? JSON.stringify(meta) : null]
    );
  } catch (err) {
    console.error('[delivery-events] log failed:', err.message);
  }
}

/**
 * Helper to verify partner KYC is approved
 */
async function checkPartnerKycApproved(partnerId) {
  const kycResult = await query(
    'SELECT * FROM partner_kyc WHERE partner_id = $1 AND status = $2',
    [partnerId, 'approved']
  );
  return kycResult.rows.length > 0;
}

/**
 * GTM cycle-3: system-backed referral rewards.
 * When a referred partner completes their FIRST delivered trip, auto-mark the
 * referral 'qualified' and stamp the currently configured partner_referral_bonus.
 * Reward is only *earned* after a real trip (never on signup); admin still
 * reviews fraud and marks 'paid'. Never throws — a referral-hook failure must
 * not fail the delivery itself.
 */
async function qualifyReferralOnFirstTrip(partnerId) {
  if (!partnerId) return;
  try {
    const pending = await query(
      `SELECT id FROM partner_referrals
       WHERE referred_partner_id = $1 AND status = 'pending' LIMIT 1`,
      [partnerId]
    );
    if (pending.rows.length === 0) return;

    const countRes = await query(
      `SELECT COUNT(*)::int AS n FROM delivery_requests
       WHERE partner_id = $1 AND status = 'delivered'`,
      [partnerId]
    );
    if (Number(countRes.rows[0].n) !== 1) return; // not the first trip

    let bonus = null;
    try {
      const cfg = await query(
        `SELECT value FROM app_config WHERE key = 'partner_referral_bonus'`
      );
      if (cfg.rows.length > 0) {
        const v = Number(cfg.rows[0].value);
        if (Number.isFinite(v) && v >= 0) bonus = v;
      }
    } catch {
      // app_config may not exist in some envs — bonus stays null (honest: unset)
    }

    await query(
      `UPDATE partner_referrals
       SET status = 'qualified', bonus_amount = COALESCE($2, bonus_amount)
       WHERE id = $1 AND status = 'pending'`,
      [pending.rows[0].id, bonus]
    );
  } catch (err) {
    console.error('[referral] auto-qualify failed:', err.message);
  }
}

/**
 * GET /api/delivery/requests
 * Partner only, KYC must be approved (admins bypass).
 * An off-duty partner (is_online=false, role=partner) sees ONLY requests already assigned to them.
 * An on-duty partner or an admin additionally sees unassigned 'requested' pings.
 * Strips pickup_otp and delivery_otp for partners.
 */
async function listDeliveryRequests(req, res, next) {
  try {
    const isApproved = await checkPartnerKycApproved(req.user.id);
    if (!isApproved && req.user.role !== 'admin') {
      return res.status(403).json({
        error: 'Forbidden: Delivery partner KYC verification must be approved to access delivery requests.',
      });
    }

    const isPartner = req.user.role === 'partner';
    const isOffDuty = isPartner && !req.user.is_online;

    let result;
    if (req.user.role === 'admin') {
      result = await query(
        `SELECT dr.*, o.shop_id, o.fulfillment, o.total, o.items, o.customer_id, o.status as order_status, s.name as shop_name, s.address as shop_address
         FROM delivery_requests dr
         JOIN orders o ON dr.order_id = o.id
         JOIN shops s ON o.shop_id = s.id
         ORDER BY dr.id DESC`
      );
    } else if (isOffDuty) {
      result = await query(
        `SELECT dr.*, o.shop_id, o.fulfillment, o.total, o.items, o.customer_id, o.status as order_status, s.name as shop_name, s.address as shop_address
         FROM delivery_requests dr
         JOIN orders o ON dr.order_id = o.id
         JOIN shops s ON o.shop_id = s.id
         WHERE dr.partner_id = $1
         ORDER BY dr.id DESC`,
        [req.user.id]
      );
    } else {
      result = await query(
        `SELECT dr.*, o.shop_id, o.fulfillment, o.total, o.items, o.customer_id, o.status as order_status, s.name as shop_name, s.address as shop_address
         FROM delivery_requests dr
         JOIN orders o ON dr.order_id = o.id
         JOIN shops s ON o.shop_id = s.id
         WHERE dr.partner_id = $1 OR (dr.partner_id IS NULL AND dr.status = 'requested')
         ORDER BY dr.id DESC`,
        [req.user.id]
      );
    }

    const rows = result.rows.map((row) => {
      if (req.user.role === 'partner') {
        const { pickup_otp, delivery_otp, ...clean } = row;
        return clean;
      }
      return row;
    });

    return res.json(rows);
  } catch (error) {
    next(error);
  }
}

/**
 * PATCH /api/delivery/requests/:id
 * Partner updates delivery request status:
 * requested -> accepted -> picked -> delivered
 */
async function updateDeliveryRequestStatus(req, res, next) {
  try {
    const { id } = req.params;
    const { status } = req.body;

    if (!status) {
      return res.status(400).json({ error: 'status is required' });
    }

    const isApproved = await checkPartnerKycApproved(req.user.id);
    if (!isApproved && req.user.role !== 'admin') {
      return res.status(403).json({
        error: 'Forbidden: Delivery partner KYC verification must be approved.',
      });
    }

    const deliveryResult = await query('SELECT * FROM delivery_requests WHERE id = $1', [id]);
    if (deliveryResult.rows.length === 0) {
      return res.status(404).json({ error: 'Delivery request not found' });
    }

    const deliveryReq = deliveryResult.rows[0];
    const currentStatus = deliveryReq.status;
    const targetStatus = status.toLowerCase();

    // Check 409 race handling: if request is already accepted by another partner
    if (targetStatus === 'accepted') {
      if (deliveryReq.partner_id !== null && deliveryReq.partner_id !== req.user.id) {
        return res.status(409).json({
          error: 'Delivery request has already been accepted by another partner.',
        });
      }
    }

    // Check valid transition
    if (!isValidDeliveryStatusTransition(currentStatus, targetStatus)) {
      return res.status(400).json({
        error: `Invalid delivery status transition from '${currentStatus}' to '${targetStatus}'. Allowed next: [${(PARTNER_LEGAL_TRANSITIONS[currentStatus] || []).join(', ')}]`,
      });
    }

    // Check duty guard: offline partner cannot accept new requests
    if (targetStatus === 'accepted') {
      if (req.user.role === 'partner' && !req.user.is_online) {
        return res.status(403).json({
          error: 'You are offline. Go online to accept deliveries.',
        });
      }
    } else {
      // For 'picked' or 'delivered', partner must already be assigned to this request
      if (deliveryReq.partner_id !== req.user.id && req.user.role !== 'admin') {
        return res.status(403).json({
          error: 'Forbidden: You are not assigned to this delivery request.',
        });
      }
    }

    // OTP validation
    if (targetStatus === 'picked') {
      const providedOtp = req.body.otp !== undefined && req.body.otp !== null ? String(req.body.otp).trim() : '';
      if (!providedOtp || providedOtp !== String(deliveryReq.pickup_otp)) {
        await logDeliveryEvent(deliveryReq.id, req.user.id, 'otp_failed', { for: 'picked' });
        return res.status(400).json({
          error: 'Incorrect pickup code. Ask the shop staff for the 4-digit code.',
        });
      }
    } else if (targetStatus === 'delivered') {
      const providedOtp = req.body.otp !== undefined && req.body.otp !== null ? String(req.body.otp).trim() : '';
      if (!providedOtp || providedOtp !== String(deliveryReq.delivery_otp)) {
        await logDeliveryEvent(deliveryReq.id, req.user.id, 'otp_failed', { for: 'delivered' });
        return res.status(400).json({
          error: 'Incorrect delivery code. Ask the customer for the 4-digit code.',
        });
      }
    }

    // Update delivery request
    let updatedResult;
    if (targetStatus === 'accepted') {
      const pickupOtp = String(crypto.randomInt(1000, 10000));
      const partnerIdToSet = req.user.id;
      updatedResult = await query(
        `UPDATE delivery_requests
         SET status = $1, partner_id = $2, pickup_otp = $3, updated_at = CURRENT_TIMESTAMP
         WHERE id = $4 AND status = $5
         RETURNING *`,
        [targetStatus, partnerIdToSet, pickupOtp, id, currentStatus]
      );
    } else if (targetStatus === 'picked') {
      const deliveryOtp = String(crypto.randomInt(1000, 10000));
      updatedResult = await query(
        `UPDATE delivery_requests
         SET status = $1, delivery_otp = $2, updated_at = CURRENT_TIMESTAMP
         WHERE id = $3 AND status = $4
         RETURNING *`,
        [targetStatus, deliveryOtp, id, currentStatus]
      );
    } else if (targetStatus === 'cancelled') {
      // Partner-initiated cancel of an accepted trip (bike broke, emergency…).
      // The order itself is untouched — it is NOT marked cancelled.
      updatedResult = await query(
        `UPDATE delivery_requests
         SET status = $1, cancelled_by = $2, updated_at = CURRENT_TIMESTAMP
         WHERE id = $3 AND status = $4
         RETURNING *`,
        [targetStatus, req.user.role === 'partner' ? 'partner' : 'order', id, currentStatus]
      );
    } else {
      updatedResult = await query(
        `UPDATE delivery_requests
         SET status = $1, updated_at = CURRENT_TIMESTAMP
         WHERE id = $2 AND status = $3
         RETURNING *`,
        [targetStatus, id, currentStatus]
      );
    }

    if (updatedResult.rowCount === 0) {
      return res.status(409).json({
        error: 'Delivery request status changed concurrently',
      });
    }

    // Backend-verified trip event for the reliability score + timeline
    await logDeliveryEvent(updatedResult.rows[0].id, req.user.id, targetStatus, {
      by: req.user.role,
      from: currentStatus,
    });

    // Sync order status
    let correspondingOrderStatus = null;
    if (targetStatus === 'accepted') {
      correspondingOrderStatus = 'assigned';
    } else if (targetStatus === 'picked') {
      correspondingOrderStatus = 'picked';
    } else if (targetStatus === 'delivered') {
      correspondingOrderStatus = 'delivered';
    }

    if (correspondingOrderStatus) {
      await query(
        `UPDATE orders
         SET status = $1, updated_at = CURRENT_TIMESTAMP
         WHERE id = $2`,
        [correspondingOrderStatus, deliveryReq.order_id]
      );
    }

    // GTM cycle-3: system-backed referral rewards — first delivered trip of a
    // referred partner auto-qualifies the referral with the configured bonus.
    // Admin still reviews fraud and marks 'paid'; no money moves automatically.
    if (targetStatus === 'delivered') {
      await qualifyReferralOnFirstTrip(updatedResult.rows[0].partner_id);
    }

    const responseData = { ...updatedResult.rows[0] };
    if (req.user.role === 'partner') {
      delete responseData.pickup_otp;
      delete responseData.delivery_otp;
    }

    return res.json(responseData);
  } catch (error) {
    next(error);
  }
}

/**
 * PATCH /api/admin/sos-alerts/:id
 * Admin: acknowledge or resolve an SOS alert.
 */
async function updateSosAlert(req, res, next) {
  try {
    const { id } = req.params;
    const { status } = req.body;

    if (!status || !['acknowledged', 'resolved'].includes(status)) {
      return res.status(400).json({ error: "status must be 'acknowledged' or 'resolved'" });
    }

    const existing = await query('SELECT * FROM sos_alerts WHERE id = $1', [id]);
    if (existing.rows.length === 0) {
      return res.status(404).json({ error: 'SOS alert not found' });
    }

    const result = await query(
      `UPDATE sos_alerts SET status = $1 WHERE id = $2 RETURNING *`,
      [status, id]
    );
    return res.json(result.rows[0]);
  } catch (error) {
    next(error);
  }
}

// ---------------------------------------------------------------------------
// Partner cycle-3: trip notes (quick chips), travel disputes, reliability,
// end-of-day recap. All metrics come from backend-verified rows only.
// ---------------------------------------------------------------------------

const TRIP_CHIPS = ['arrived_at_shop', 'waiting_for_packing', 'contacted_customer'];

async function requireKycPartner(req, res) {
  if (req.user.role === 'admin') return true;
  const ok = await checkPartnerKycApproved(req.user.id);
  if (!ok) {
    res.status(403).json({
      error: 'Forbidden: Delivery partner KYC verification must be approved.',
    });
    return false;
  }
  return true;
}

async function getOwnedRequest(requestId, user) {
  const r = await query('SELECT * FROM delivery_requests WHERE id = $1', [requestId]);
  if (r.rows.length === 0) return { error: 404 };
  const dr = r.rows[0];
  if (user.role !== 'admin' && dr.partner_id !== user.id) return { error: 403 };
  return { dr };
}

/**
 * POST /api/delivery/requests/:id/trip-notes
 * Partner taps a quick status chip mid-trip. No typing, no voice.
 */
async function addTripNote(req, res, next) {
  try {
    if (!(await requireKycPartner(req, res))) return;
    const { id } = req.params;
    const { chip } = req.body || {};
    if (!TRIP_CHIPS.includes(chip)) {
      return res.status(400).json({ error: `chip must be one of: ${TRIP_CHIPS.join(', ')}` });
    }
    const { dr, error } = await getOwnedRequest(id, req.user);
    if (error) return res.status(error).json({ error: error === 404 ? 'Delivery request not found' : 'Forbidden' });
    if (!['accepted', 'picked'].includes(dr.status)) {
      return res.status(400).json({ error: 'Trip notes are only allowed on active trips.' });
    }
    const result = await query(
      `INSERT INTO trip_status_updates (delivery_request_id, partner_id, chip)
       VALUES ($1, $2, $3) RETURNING *`,
      [dr.id, req.user.id, chip]
    );
    await logDeliveryEvent(dr.id, req.user.id, 'trip_note', { chip });
    return res.status(201).json(result.rows[0]);
  } catch (err) {
    next(err);
  }
}

/**
 * GET /api/delivery/requests/:id/timeline
 * Backend-verified trip timeline: events + chips + dispute state.
 * (Mart tracking timeline can read this later; partner trip screen uses it now.)
 */
async function getTripTimeline(req, res, next) {
  try {
    if (!(await requireKycPartner(req, res))) return;
    const { id } = req.params;
    const { dr, error } = await getOwnedRequest(id, req.user);
    if (error) return res.status(error).json({ error: error === 404 ? 'Delivery request not found' : 'Forbidden' });

    const events = await query(
      `SELECT event, meta, created_at FROM delivery_events
       WHERE delivery_request_id = $1 ORDER BY created_at ASC`,
      [dr.id]
    );
    const notes = await query(
      `SELECT chip, created_at FROM trip_status_updates
       WHERE delivery_request_id = $1 ORDER BY created_at ASC`,
      [dr.id]
    );
    const disputes = await query(
      `SELECT * FROM delivery_disputes WHERE delivery_request_id = $1`,
      [dr.id]
    );
    return res.json({
      delivery_request_id: dr.id,
      status: dr.status,
      cancelled_by: dr.cancelled_by,
      events: events.rows,
      trip_notes: notes.rows,
      dispute: disputes.rows[0] || null,
    });
  } catch (err) {
    next(err);
  }
}

/**
 * POST /api/delivery/disputes
 * "I already travelled" — partner disputes a trip the ORDER side cancelled
 * after they had already travelled to the shop. Partner-canelled trips
 * cannot be disputed. One dispute per delivery request.
 */
async function openDispute(req, res, next) {
  try {
    if (!(await requireKycPartner(req, res))) return;
    if (req.user.role !== 'partner') {
      return res.status(403).json({ error: 'Only partners can open disputes.' });
    }
    const { delivery_request_id, note } = req.body || {};
    if (!delivery_request_id) {
      return res.status(400).json({ error: 'delivery_request_id is required' });
    }
    const { dr, error } = await getOwnedRequest(delivery_request_id, req.user);
    if (error) return res.status(error).json({ error: error === 404 ? 'Delivery request not found' : 'Forbidden' });
    if (dr.status !== 'cancelled' || dr.cancelled_by !== 'order') {
      return res.status(400).json({
        error: 'Disputes are only allowed on trips cancelled by the customer/shop.',
      });
    }
    try {
      const result = await query(
        `INSERT INTO delivery_disputes (delivery_request_id, partner_id, note)
         VALUES ($1, $2, $3) RETURNING *`,
        [dr.id, req.user.id, note || null]
      );
      await logDeliveryEvent(dr.id, req.user.id, 'dispute_opened', {});
      return res.status(201).json(result.rows[0]);
    } catch (e) {
      if (e.code === '23505') {
        return res.status(409).json({ error: 'A dispute already exists for this trip.' });
      }
      throw e;
    }
  } catch (err) {
    next(err);
  }
}

/**
 * GET /api/delivery/disputes
 * Partner: own disputes. Admin: all (optional ?status=open|approved|rejected).
 */
async function listDisputes(req, res, next) {
  try {
    if (req.user.role === 'partner' && !(await requireKycPartner(req, res))) return;
    const params = [];
    let where = '';
    if (req.user.role === 'partner') {
      where = 'WHERE d.partner_id = $1';
      params.push(req.user.id);
    } else if (req.query.status && ['open', 'approved', 'rejected'].includes(req.query.status)) {
      where = 'WHERE d.status = $1';
      params.push(req.query.status);
    }
    const result = await query(
      `SELECT d.*, u.name AS partner_name, dr.order_id, dr.cancelled_by
       FROM delivery_disputes d
       JOIN users u ON u.id = d.partner_id
       JOIN delivery_requests dr ON dr.id = d.delivery_request_id
       ${where}
       ORDER BY d.created_at DESC
       LIMIT 100`,
      params
    );
    return res.json(result.rows);
  } catch (err) {
    next(err);
  }
}

/**
 * PATCH /api/delivery/disputes/:id
 * Admin: approve or reject. goodwill_amount (₹) may be set on approval only —
 * it is an admin-entered amount, never invented by the client.
 */
async function resolveDispute(req, res, next) {
  try {
    const { id } = req.params;
    const { status, goodwill_amount } = req.body || {};
    if (!['approved', 'rejected'].includes(status)) {
      return res.status(400).json({ error: "status must be 'approved' or 'rejected'" });
    }
    let goodwill = null;
    if (goodwill_amount !== undefined && goodwill_amount !== null) {
      goodwill = Number(goodwill_amount);
      if (!Number.isFinite(goodwill) || goodwill < 0) {
        return res.status(400).json({ error: 'goodwill_amount must be a non-negative number' });
      }
      if (status !== 'approved') {
        return res.status(400).json({ error: 'goodwill_amount can only be set on approval' });
      }
    }
    const existing = await query('SELECT * FROM delivery_disputes WHERE id = $1', [id]);
    if (existing.rows.length === 0) {
      return res.status(404).json({ error: 'Dispute not found' });
    }
    if (existing.rows[0].status !== 'open') {
      return res.status(409).json({ error: 'Dispute is already resolved.' });
    }
    const result = await query(
      `UPDATE delivery_disputes
       SET status = $1, goodwill_amount = $2, resolved_by = $3, resolved_at = NOW()
       WHERE id = $4 RETURNING *`,
      [status, goodwill, req.user.id, id]
    );
    const disp = result.rows[0];
    await logDeliveryEvent(disp.delivery_request_id, disp.partner_id, 'dispute_resolved', {
      status,
      goodwill_amount: goodwill,
    });
    return res.json(disp);
  } catch (err) {
    next(err);
  }
}

const RELIABILITY_MIN_TRIPS = 3;
const ONTIME_PICKUP_MINUTES = 30;

/**
 * GET /api/delivery/reliability
 * Private reliability score from backend-verified events only.
 * Partner sees their own; admin may pass ?partner_id=.
 * Never customer-facing (no Mart exposure).
 */
async function getReliability(req, res, next) {
  try {
    let partnerId = req.user.id;
    if (req.query.partner_id) {
      if (req.user.role !== 'admin') {
        return res.status(403).json({ error: 'Only admins can view other partners.' });
      }
      partnerId = Number(req.query.partner_id);
    }
    if (req.user.role === 'partner' && !(await requireKycPartner(req, res))) return;

    const agg = await query(
      `SELECT status, cancelled_by, COUNT(*)::int AS n
       FROM delivery_requests
       WHERE partner_id = $1 AND status IN ('accepted', 'picked', 'delivered', 'cancelled')
       GROUP BY status, cancelled_by`,
      [partnerId]
    );
    let assigned = 0;
    let delivered = 0;
    let partnerCancelled = 0;
    for (const r of agg.rows) {
      assigned += r.n;
      if (r.status === 'delivered') delivered += r.n;
      if (r.status === 'cancelled' && r.cancelled_by === 'partner') partnerCancelled += r.n;
    }

    const ev = await query(
      `SELECT delivery_request_id, event, created_at
       FROM delivery_events
       WHERE partner_id = $1 AND event IN ('accepted', 'picked', 'otp_failed')
       ORDER BY created_at ASC`,
      [partnerId]
    );
    const acceptedAt = {};
    const pickedAt = {};
    let otpFailures = 0;
    for (const r of ev.rows) {
      if (r.event === 'accepted' && acceptedAt[r.delivery_request_id] === undefined) {
        acceptedAt[r.delivery_request_id] = new Date(r.created_at).getTime();
      } else if (r.event === 'picked' && pickedAt[r.delivery_request_id] === undefined) {
        pickedAt[r.delivery_request_id] = new Date(r.created_at).getTime();
      } else if (r.event === 'otp_failed') {
        otpFailures += 1;
      }
    }
    let ontimePickups = 0;
    let timedPickups = 0;
    for (const reqId of Object.keys(pickedAt)) {
      if (acceptedAt[reqId] !== undefined) {
        timedPickups += 1;
        if (pickedAt[reqId] - acceptedAt[reqId] <= ONTIME_PICKUP_MINUTES * 60000) ontimePickups += 1;
      }
    }

    const recent = await query(
      `SELECT status FROM delivery_requests
       WHERE partner_id = $1 AND status IN ('delivered', 'cancelled')
       ORDER BY updated_at DESC LIMIT 20`,
      [partnerId]
    );
    let streak = 0;
    for (const r of recent.rows) {
      if (r.status === 'delivered') streak += 1;
      else break;
    }

    if (assigned < RELIABILITY_MIN_TRIPS) {
      return res.json({
        score: null,
        trips: assigned,
        note: `Not enough trips yet — reliability appears after ${RELIABILITY_MIN_TRIPS} trips.`,
      });
    }

    const completion = delivered / assigned;
    const ontimeRate = timedPickups > 0 ? ontimePickups / timedPickups : completion;
    const cancelAdj = 1 - partnerCancelled / assigned;
    const score = Math.round(100 * (0.55 * completion + 0.25 * ontimeRate + 0.2 * cancelAdj));

    return res.json({
      score,
      trips: assigned,
      delivered,
      streak,
      completion_pct: Math.round(completion * 1000) / 10,
      ontime_pickup_pct: timedPickups > 0 ? Math.round(ontimeRate * 1000) / 10 : null,
      partner_cancel_pct: Math.round((partnerCancelled / assigned) * 1000) / 10,
      otp_failures: otpFailures,
      formula: '55% completion + 25% on-time pickup (≤30 min) + 20% no partner-cancel; events only',
    });
  } catch (err) {
    next(err);
  }
}

/**
 * Start/end of the current day in Asia/Kolkata as UTC ISO strings.
 * (pg-mem has no AT TIME ZONE, so we compute the bounds in JS.)
 */
function istDayBounds(nowMs = Date.now()) {
  const IST = 5.5 * 3600 * 1000;
  const nowIst = new Date(nowMs + IST);
  const startIst = Date.UTC(nowIst.getUTCFullYear(), nowIst.getUTCMonth(), nowIst.getUTCDate());
  return {
    startIso: new Date(startIst - IST).toISOString(),
    endIso: new Date(startIst + 86400000 - IST).toISOString(),
    date: nowIst.toISOString().slice(0, 10),
  };
}

/**
 * GET /api/delivery/recap
 * End-of-day recap from REAL rows only: today's delivered trips and the
 * SUM of their recorded delivery_fee. When no fee was recorded for a trip,
 * earnings are null with an honest note — never projected or promised.
 */
async function getRecap(req, res, next) {
  try {
    if (!(await requireKycPartner(req, res))) return;
    const { startIso, endIso, date } = istDayBounds();
    const result = await query(
      `SELECT COUNT(*)::int AS trips,
              COALESCE(SUM(delivery_fee), 0)::float AS fees,
              COUNT(delivery_fee)::int AS fees_recorded,
              MIN(updated_at) AS first_trip_at,
              MAX(updated_at) AS last_trip_at
       FROM delivery_requests
       WHERE partner_id = $1 AND status = 'delivered'
         AND updated_at >= $2 AND updated_at < $3`,
      [req.user.id, startIso, endIso]
    );
    const r = result.rows[0];
    // Honest earnings: only when EVERY delivered trip today has a recorded
    // fee. A partial sum would look like total earnings — never show that.
    const earnings =
      r.trips > 0 && r.fees_recorded === r.trips ? Math.round(r.fees * 100) / 100 : null;
    return res.json({
      date,
      trips: r.trips,
      earnings,
      earnings_note:
        r.trips === 0
          ? 'No trips completed today.'
          : earnings === null
            ? 'Delivery fee not recorded for all trips — earnings unavailable.'
            : `Sum of recorded delivery fees for ${r.trips} trip(s).`,
      first_trip_at: r.first_trip_at,
      last_trip_at: r.last_trip_at,
    });
  } catch (err) {
    next(err);
  }
}

module.exports = {
  listDeliveryRequests,
  updateDeliveryRequestStatus,
  sendSosAlert,
  listSosAlerts,
  updateSosAlert,
  checkPartnerKycApproved,
  isValidDeliveryStatusTransition,
  PARTNER_LEGAL_TRANSITIONS,
  addTripNote,
  getTripTimeline,
  openDispute,
  listDisputes,
  resolveDispute,
  getReliability,
  getRecap,
  istDayBounds,
};

/**
 * POST /api/delivery/sos
 * Partner (KYC-approved) sends an SOS alert with optional GPS + active delivery.
 */
async function sendSosAlert(req, res, next) {
  try {
    const isApproved = await checkPartnerKycApproved(req.user.id);
    if (!isApproved && req.user.role !== 'admin') {
      return res.status(403).json({
        error: 'Forbidden: Delivery partner KYC verification must be approved.',
      });
    }

    const { lat, lng, delivery_request_id, note } = req.body || {};

    const numOrNull = (v) => {
      if (v === undefined || v === null || v === '') return null;
      const n = Number(v);
      return Number.isFinite(n) ? n : null;
    };
    const latN = numOrNull(lat);
    const lngN = numOrNull(lng);
    if ((lat !== undefined && lat !== null && lat !== '' && latN === null) ||
        (lng !== undefined && lng !== null && lng !== '' && lngN === null)) {
      return res.status(400).json({ error: 'lat/lng must be numbers when provided.' });
    }

    let drId = null;
    if (delivery_request_id !== undefined && delivery_request_id !== null && delivery_request_id !== '') {
      const drIdN = Number(delivery_request_id);
      if (!Number.isInteger(drIdN)) {
        return res.status(400).json({ error: 'delivery_request_id must be an integer.' });
      }
      const dr = await query('SELECT id, partner_id FROM delivery_requests WHERE id = $1', [drIdN]);
      if (dr.rows.length === 0) {
        return res.status(404).json({ error: 'Delivery request not found.' });
      }
      if (req.user.role === 'partner' && dr.rows[0].partner_id !== req.user.id) {
        return res.status(403).json({ error: 'That delivery is not assigned to you.' });
      }
      drId = drIdN;
    }

    const noteStr = typeof note === 'string' ? note.slice(0, 500) : null;

    const result = await query(
      `INSERT INTO sos_alerts (partner_id, delivery_request_id, lat, lng, note)
       VALUES ($1, $2, $3, $4, $5)
       RETURNING id, partner_id, delivery_request_id, lat, lng, note, status, created_at`,
      [req.user.id, drId, latN, lngN, noteStr],
    );
    return res.status(201).json(result.rows[0]);
  } catch (error) {
    next(error);
  }
}

/**
 * GET /api/admin/sos-alerts
 * Admin: latest SOS alerts with partner name, open/acknowledged first.
 */
async function listSosAlerts(req, res, next) {
  try {
    const result = await query(
      `SELECT sa.*, u.name AS partner_name
       FROM sos_alerts sa
       JOIN users u ON u.id = sa.partner_id
       WHERE sa.status IN ('open', 'acknowledged')
       ORDER BY sa.created_at DESC
       LIMIT 50`,
    );
    return res.json(result.rows);
  } catch (error) {
    next(error);
  }
}
