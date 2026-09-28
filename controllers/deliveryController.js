const crypto = require('crypto');
const { query } = require('../db');

const PARTNER_LEGAL_TRANSITIONS = {
  requested: ['accepted'],
  accepted: ['picked'],
  picked: ['delivered'],
};

function isValidDeliveryStatusTransition(currentStatus, targetStatus) {
  const allowed = PARTNER_LEGAL_TRANSITIONS[currentStatus];
  if (!allowed) return false;
  return allowed.includes(targetStatus);
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
        `SELECT dr.*, o.shop_id, o.fulfillment, o.total, o.items, o.customer_id, s.name as shop_name, s.address as shop_address
         FROM delivery_requests dr
         JOIN orders o ON dr.order_id = o.id
         JOIN shops s ON o.shop_id = s.id
         ORDER BY dr.id DESC`
      );
    } else if (isOffDuty) {
      result = await query(
        `SELECT dr.*, o.shop_id, o.fulfillment, o.total, o.items, o.customer_id, s.name as shop_name, s.address as shop_address
         FROM delivery_requests dr
         JOIN orders o ON dr.order_id = o.id
         JOIN shops s ON o.shop_id = s.id
         WHERE dr.partner_id = $1
         ORDER BY dr.id DESC`,
        [req.user.id]
      );
    } else {
      result = await query(
        `SELECT dr.*, o.shop_id, o.fulfillment, o.total, o.items, o.customer_id, s.name as shop_name, s.address as shop_address
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
        return res.status(400).json({
          error: 'Incorrect pickup code. Ask the shop staff for the 4-digit code.',
        });
      }
    } else if (targetStatus === 'delivered') {
      const providedOtp = req.body.otp !== undefined && req.body.otp !== null ? String(req.body.otp).trim() : '';
      if (!providedOtp || providedOtp !== String(deliveryReq.delivery_otp)) {
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
         WHERE id = $4
         RETURNING *`,
        [targetStatus, partnerIdToSet, pickupOtp, id]
      );
    } else if (targetStatus === 'picked') {
      const deliveryOtp = String(crypto.randomInt(1000, 10000));
      updatedResult = await query(
        `UPDATE delivery_requests
         SET status = $1, delivery_otp = $2, updated_at = CURRENT_TIMESTAMP
         WHERE id = $3
         RETURNING *`,
        [targetStatus, deliveryOtp, id]
      );
    } else {
      updatedResult = await query(
        `UPDATE delivery_requests
         SET status = $1, updated_at = CURRENT_TIMESTAMP
         WHERE id = $2
         RETURNING *`,
        [targetStatus, id]
      );
    }

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

module.exports = {
  listDeliveryRequests,
  updateDeliveryRequestStatus,
  checkPartnerKycApproved,
  isValidDeliveryStatusTransition,
  PARTNER_LEGAL_TRANSITIONS,
};
