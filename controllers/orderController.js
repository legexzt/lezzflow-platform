const { query, getClient } = require('../db');
const { resolveProductByBarcode } = require('../services/barcodeService');

// Legal status transitions for sellers
const SELLER_LEGAL_TRANSITIONS = {
  placed: ['accepted', 'cancelled'],
  accepted: ['packed', 'cancelled'],
  packed: ['cancelled'],
};

/**
 * Check if a status transition is valid for an order
 * @param {string} currentStatus Current order status
 * @param {string} targetStatus Target order status
 * @param {string} role User role ('seller', 'admin', etc.)
 * @returns {boolean}
 */
function isValidOrderStatusTransition(currentStatus, targetStatus, role = 'seller') {
  if (role === 'admin') {
    const allStatuses = ['placed', 'accepted', 'packed', 'assigned', 'picked', 'delivered', 'cancelled'];
    return allStatuses.includes(targetStatus);
  }

  const allowed = SELLER_LEGAL_TRANSITIONS[currentStatus];
  if (!allowed) {
    return false;
  }
  return allowed.includes(targetStatus);
}

/**
 * Exported helper: atomically transition an order status with optimistic concurrency.
 * @param {object} client pg client (within a transaction)
 * @param {number|string} orderId
 * @param {string} targetStatus
 * @param {string} role
 * @throws {{ status: number, message: string }} on validation or concurrency errors
 */
async function transitionOrder(client, orderId, targetStatus, role) {
  const orderResult = await client.query(
    `SELECT o.*, s.seller_id
     FROM orders o
     JOIN shops s ON o.shop_id = s.id
     WHERE o.id = $1`,
    [orderId]
  );

  if (orderResult.rows.length === 0) {
    const err = new Error('Order not found');
    err.status = 404;
    throw err;
  }

  const order = orderResult.rows[0];
  const currentStatus = order.status;

  if (!isValidOrderStatusTransition(currentStatus, targetStatus, role)) {
    const err = new Error(
      `Invalid status transition from '${currentStatus}' to '${targetStatus}'. Legal next transitions: [${(SELLER_LEGAL_TRANSITIONS[currentStatus] || []).join(', ')}]`
    );
    err.status = 400;
    throw err;
  }

  // Optimistic concurrency: guard on current status
  const updated = await client.query(
    `UPDATE orders
     SET status = $1, updated_at = CURRENT_TIMESTAMP
     WHERE id = $2 AND status = $3
     RETURNING *`,
    [targetStatus, orderId, currentStatus]
  );

  if (updated.rowCount === 0) {
    const err = new Error('Order status changed concurrently');
    err.status = 409;
    throw err;
  }

  // Partner cycle-3: a cancelled order must not silently strand the partner's
  // trip. Mark the linked delivery request cancelled (cancelled_by='order')
  // and log a backend-verified event, so the partner sees it in their
  // Cancelled section instead of watching the trip vanish.
  if (targetStatus === 'cancelled') {
    const drRes = await client.query(
      `UPDATE delivery_requests
       SET status = 'cancelled', cancelled_by = 'order', updated_at = CURRENT_TIMESTAMP
       WHERE order_id = $1 AND status IN ('requested', 'accepted', 'picked')
       RETURNING id, partner_id`,
      [orderId]
    );
    for (const dr of drRes.rows) {
      await client.query(
        `INSERT INTO delivery_events (delivery_request_id, partner_id, event, meta)
         VALUES ($1, $2, 'cancelled', $3)`,
        [dr.id, dr.partner_id, JSON.stringify({ by: 'order', order_status: 'cancelled' })]
      );
    }
  }

  return updated.rows[0];
}

/**
 * POST /api/orders
 * Customer creates a new order (idempotent via Idempotency-Key header).
 */
async function createOrder(req, res, next) {
  const idempotencyKey = req.headers['idempotency-key'];
  const client = await getClient();

  try {
    const { shop_id, items, fulfillment, total, address, offer_id } = req.body;

    if (!shop_id || !items || !fulfillment) {
      return res.status(400).json({
        error: 'shop_id, items, and fulfillment are required',
      });
    }

    if (!['delivery', 'pickup'].includes(fulfillment)) {
      return res.status(400).json({
        error: `Invalid fulfillment type '${fulfillment}'. Allowed types: 'delivery', 'pickup'`,
      });
    }

    if (fulfillment === 'delivery' && !address) {
      return res.status(400).json({
        error: 'Delivery address is required',
      });
    }

    if (!Array.isArray(items) || items.length === 0) {
      return res.status(400).json({
        error: 'items must be a non-empty array',
      });
    }

    await client.query('BEGIN');

    // --- Idempotency check ---
    if (idempotencyKey) {
      const existing = await client.query(
        `SELECT response, status_code FROM idempotency_keys
         WHERE key = $1 AND user_id = $2 AND expires_at > now()`,
        [idempotencyKey, req.user.id]
      );
      if (existing.rows.length > 0) {
        await client.query('COMMIT');
        return res
          .status(existing.rows[0].status_code)
          .json(existing.rows[0].response);
      }
    }

    // Verify shop exists
    const shopResult = await client.query('SELECT * FROM shops WHERE id = $1', [shop_id]);
    if (shopResult.rows.length === 0) {
      await client.query('ROLLBACK');
      return res.status(404).json({ error: 'Shop not found' });
    }

    // Verify shop is open
    const shop = shopResult.rows[0];
    if (shop.is_open === false) {
      await client.query('ROLLBACK');
      return res.status(400).json({ error: 'Shop is currently closed' });
    }

    // Compute or validate total
    let calculatedTotal = 0;
    if (total !== undefined && !isNaN(parseFloat(total))) {
      calculatedTotal = parseFloat(total);
    } else {
      for (const item of items) {
        const itemPrice = parseFloat(item.price || 0);
        const itemQty = parseInt(item.quantity || 1, 10);
        calculatedTotal += itemPrice * itemQty;
      }
    }

    // --- Atomic stock decrement ---
    for (const item of items) {
      if (!item.product_id) continue; // custom item — no product_id, skip guard
      const qty = parseInt(item.quantity || 1, 10);
      // pg-mem workaround: use stock + (-qty) instead of stock - qty, and separate params
      // for the WHERE guard so the same param index isn't reused in SET and WHERE.
      // Only guard products that actually exist in the DB; if not found, skip
      // (item may be a historical/custom reference with a product_id).
      const stockResult = await client.query(
        `UPDATE products
         SET stock = stock + $1
         WHERE id = $2 AND stock >= $3`,
        [-qty, item.product_id, qty]
      );
      if (stockResult.rowCount === 0) {
        // Could be: product doesn't exist OR stock insufficient. Check which.
        const productCheck = await client.query(
          'SELECT id FROM products WHERE id = $1',
          [item.product_id]
        );
        if (productCheck.rows.length > 0) {
          // Product exists but stock insufficient
          await client.query('ROLLBACK');
          return res
            .status(400)
            .json({ error: `Insufficient stock for product ${item.product_id}` });
        }
        // Product doesn't exist — treat like custom item, skip guard
      }
    }


    // --- Dukaan Offer: validate server-side, never trust client discount ---
    // The client may suggest an offer_id, but the discount is always computed
    // here from the real shop_offers row (active, in-window, min_order met).
    let appliedOfferId = null;
    let appliedDiscount = 0;
    if (offer_id !== undefined && offer_id !== null && offer_id !== '') {
      const offerResult = await client.query(
        `SELECT * FROM shop_offers
         WHERE id = $1 AND shop_id = $2 AND active = TRUE
           AND (valid_from IS NULL OR valid_from <= now())
           AND (valid_to IS NULL OR valid_to >= now())`,
        [offer_id, shop_id]
      );
      if (offerResult.rows.length === 0) {
        await client.query('ROLLBACK');
        return res.status(400).json({ error: 'Offer is not valid for this shop right now.' });
      }
      const offer = offerResult.rows[0];
      const minOrder = Number(offer.min_order) || 0;
      if (calculatedTotal < minOrder) {
        await client.query('ROLLBACK');
        return res
          .status(400)
          .json({ error: `This offer needs a minimum order of Rs ${minOrder}.` });
      }
      const value = Number(offer.discount_value) || 0;
      const rawDiscount =
        offer.discount_type === 'percent' ? (calculatedTotal * value) / 100 : value;
      appliedDiscount = Math.min(Math.max(rawDiscount, 0), calculatedTotal);
      appliedOfferId = offer.id;
      calculatedTotal = Math.max(calculatedTotal - appliedDiscount, 0);
    }

    const itemsJson = typeof items === 'string' ? items : JSON.stringify(items);

    const result = await client.query(
      `INSERT INTO orders (customer_id, shop_id, items, fulfillment, total, address, status, offer_id, discount)
       VALUES ($1, $2, $3, $4, $5, $6, 'placed', $7, $8)
       RETURNING *`,
      [req.user.id, shop_id, itemsJson, fulfillment, calculatedTotal, address || null, appliedOfferId, appliedDiscount]
    );

    const newOrder = result.rows[0];

    // --- Persist idempotency record ---
    if (idempotencyKey) {
      const insertResult = await client.query(
        `INSERT INTO idempotency_keys (key, user_id, response, status_code, expires_at)
         VALUES ($1, $2, $3, $4, now() + interval '24 hours')
         ON CONFLICT (key) DO NOTHING`,
        [idempotencyKey, req.user.id, newOrder, 201]
      );

      if (insertResult.rowCount === 0) {
        // Conflict: another concurrent request stored the key first — replay it
        const replay = await client.query(
          `SELECT response, status_code FROM idempotency_keys
           WHERE key = $1 AND user_id = $2`,
          [idempotencyKey, req.user.id]
        );
        await client.query('COMMIT');
        if (replay.rows.length > 0) {
          return res.status(replay.rows[0].status_code).json(replay.rows[0].response);
        }
      }
    }

    await client.query('COMMIT');

    // Opportunistic cleanup of expired keys (fire-and-forget)
    query('DELETE FROM idempotency_keys WHERE expires_at < now()').catch(() => {});

    return res.status(201).json(newOrder);
  } catch (error) {
    try { await client.query('ROLLBACK'); } catch (_) {}
    next(error);
  } finally {
    client.release();
  }
}

/**
 * GET /api/orders
 * List orders for customer or seller
 */
async function listOrders(req, res, next) {
  try {
    let result;
    if (req.user.role === 'customer') {
      result = await query(
        `SELECT o.*, s.name as shop_name, su.phone as shop_phone, pu.phone as partner_phone
         FROM orders o
         JOIN shops s ON o.shop_id = s.id
         JOIN users su ON s.seller_id = su.id
         LEFT JOIN delivery_requests dr ON dr.order_id = o.id
         LEFT JOIN users pu ON dr.partner_id = pu.id
         WHERE o.customer_id = $1
         ORDER BY o.id DESC`,
        [req.user.id]
      );
    } else if (req.user.role === 'seller') {
      result = await query(
        `SELECT o.*, u.name as customer_name, u.phone as customer_phone 
         FROM orders o 
         JOIN shops s ON o.shop_id = s.id 
         JOIN users u ON o.customer_id = u.id 
         WHERE s.seller_id = $1 
         ORDER BY o.id DESC`,
        [req.user.id]
      );
    } else if (req.user.role === 'admin') {
      result = await query('SELECT * FROM orders ORDER BY id DESC');
    } else {
      result = await query('SELECT * FROM orders WHERE customer_id = $1 ORDER BY id DESC', [req.user.id]);
    }

    return res.json(result.rows);
  } catch (error) {
    next(error);
  }
}

/**
 * GET /api/orders/:id
 * Get single order by ID
 */
async function getOrderById(req, res, next) {
  try {
    const { id } = req.params;
    const result = await query(
      `SELECT o.*, s.name as shop_name, s.seller_id 
       FROM orders o 
       JOIN shops s ON o.shop_id = s.id 
       WHERE o.id = $1`,
      [id]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Order not found' });
    }

    const order = result.rows[0];

    // Authorization check
    if (
      req.user.role !== 'admin' &&
      order.customer_id !== req.user.id &&
      order.seller_id !== req.user.id
    ) {
      return res.status(403).json({ error: 'Forbidden: Access to this order is denied' });
    }

    return res.json(order);
  } catch (error) {
    next(error);
  }
}

/**
 * PATCH /api/orders/:id/status
 * Seller updates order status: placed -> accepted -> packed
 * Enforces legal transitions strictly via transitionOrder helper.
 */
async function updateOrderStatus(req, res, next) {
  const client = await getClient();
  try {
    const { id } = req.params;
    const { status } = req.body;

    if (!status) {
      return res.status(400).json({ error: 'status is required' });
    }

    // First check ownership (without starting transaction yet)
    const ownerCheck = await query(
      `SELECT o.*, s.seller_id
       FROM orders o
       JOIN shops s ON o.shop_id = s.id
       WHERE o.id = $1`,
      [id]
    );

    if (ownerCheck.rows.length === 0) {
      return res.status(404).json({ error: 'Order not found' });
    }

    const order = ownerCheck.rows[0];

    // Verify seller owns the shop (or is admin)
    if (order.seller_id !== req.user.id && req.user.role !== 'admin') {
      return res.status(403).json({ error: 'Forbidden: You do not own the shop for this order' });
    }

    const targetStatus = status.toLowerCase();

    await client.query('BEGIN');

    let updatedOrder;
    try {
      updatedOrder = await transitionOrder(client, id, targetStatus, req.user.role);
    } catch (transErr) {
      await client.query('ROLLBACK');
      return res.status(transErr.status || 500).json({ error: transErr.message });
    }

    await client.query('COMMIT');
    return res.json(updatedOrder);
  } catch (error) {
    try { await client.query('ROLLBACK'); } catch (_) {}
    next(error);
  } finally {
    client.release();
  }
}

/**
 * POST /api/orders/:id/assign-delivery
 * If customer chose delivery: creates delivery_request with status 'requested'.
 * If fulfillment is pickup, returns 400.
 */
async function assignDelivery(req, res, next) {
  try {
    const { id } = req.params;

    const orderResult = await query('SELECT * FROM orders WHERE id = $1', [id]);
    if (orderResult.rows.length === 0) {
      return res.status(404).json({ error: 'Order not found' });
    }

    const order = orderResult.rows[0];

    // Check fulfillment type
    if (order.fulfillment !== 'delivery') {
      return res.status(400).json({
        error: `Cannot assign delivery: order fulfillment is '${order.fulfillment}'. Only 'delivery' orders can have delivery assigned.`,
      });
    }

    // Check if delivery request already exists
    const existingDelivery = await query('SELECT * FROM delivery_requests WHERE order_id = $1', [id]);
    if (existingDelivery.rows.length > 0) {
      return res.status(400).json({
        error: 'Delivery request already exists for this order',
        delivery_request: existingDelivery.rows[0],
      });
    }

    // Create delivery request
    const result = await query(
      `INSERT INTO delivery_requests (order_id, partner_id, status)
       VALUES ($1, NULL, 'requested')
       RETURNING *`,
      [id]
    );

    return res.status(201).json(result.rows[0]);
  } catch (error) {
    next(error);
  }
}

/**
 * POST /api/orders/:id/pack-scan
 * Seller scans a product barcode while packing an order.
 * - Resolves barcode to product in seller's shop (404/403)
 * - Order must exist, belong to seller's shop, status 'accepted' (400/403/404)
 * - Product must be in order.items, scanned_qty < ordered_qty (400 "already fully scanned")
 * - Atomically decrement stock: UPDATE products SET stock = stock - 1 WHERE id = $1 AND stock > 0 (400 "out of stock")
 * - Upsert pack_scans (order_id, product_id) setting qty_scanned = qty_scanned + 1
 * - Return pack progress & running bill
 */
async function packScan(req, res, next) {
  const client = await getClient();
  try {
    const { id } = req.params;
    const { barcode } = req.body;

    if (!barcode || typeof barcode !== 'string' || !barcode.trim()) {
      return res.status(400).json({ error: 'Barcode is required' });
    }

    // b. Order must exist, belong to the seller's shop, and have status 'accepted', else 400/403/404.
    const orderRes = await query(
      `SELECT o.*, s.seller_id, s.name AS shop_name, s.address AS shop_address
       FROM orders o
       JOIN shops s ON o.shop_id = s.id
       WHERE o.id = $1`,
      [id]
    );

    if (orderRes.rows.length === 0) {
      return res.status(404).json({ error: 'Order not found' });
    }

    const order = orderRes.rows[0];

    if (order.seller_id !== req.user.id && req.user.role !== 'admin') {
      return res.status(403).json({ error: 'Forbidden: You do not own the shop for this order' });
    }

    if (order.status !== 'accepted') {
      return res.status(400).json({
        error: `Order status must be 'accepted' to pack-scan (current status: '${order.status}')`,
      });
    }

    // a. Resolve barcode to a product via the existing barcode service; product must belong to seller's shop, else 404/403.
    let product;
    try {
      const resolved = await resolveProductByBarcode(barcode, order.shop_id);
      product = resolved.product;
    } catch (barcodeErr) {
      return res.status(barcodeErr.status || 400).json({ error: barcodeErr.message });
    }

    // c. The product must be present in order.items; the already-scanned qty (from pack_scans) must be < ordered qty, else 400 "already fully scanned".
    const orderItems = typeof order.items === 'string' ? JSON.parse(order.items) : order.items;
    if (!Array.isArray(orderItems)) {
      return res.status(400).json({ error: 'Invalid order items structure' });
    }

    const orderItem = orderItems.find((item) => Number(item.product_id) === Number(product.id));
    if (!orderItem) {
      return res.status(400).json({ error: 'Product is not in this order' });
    }

    const orderedQty = parseInt(orderItem.qty || orderItem.quantity || 1, 10);

    const existingScanRes = await query(
      'SELECT qty_scanned FROM pack_scans WHERE order_id = $1 AND product_id = $2',
      [order.id, product.id]
    );
    const alreadyScanned = existingScanRes.rows.length > 0 ? parseInt(existingScanRes.rows[0].qty_scanned, 10) : 0;

    if (alreadyScanned >= orderedQty) {
      return res.status(400).json({ error: 'already fully scanned' });
    }

    // Wrap d+e in a transaction
    await client.query('BEGIN');

    // d. Atomically decrement stock: UPDATE products SET stock = stock - 1, updated_at = CURRENT_TIMESTAMP WHERE id = $1 AND stock > 0; if rowCount = 0 -> 400 "out of stock".
    const stockRes = await client.query(
      `UPDATE products
       SET stock = stock - 1, updated_at = CURRENT_TIMESTAMP
       WHERE id = $1 AND stock > 0
       RETURNING stock`,
      [product.id]
    );

    if (stockRes.rowCount === 0) {
      await client.query('ROLLBACK');
      return res.status(400).json({ error: 'out of stock' });
    }

    // e. Upsert pack_scans (order_id, product_id) setting qty_scanned = qty_scanned + 1.
    const upsertRes = await client.query(
      `INSERT INTO pack_scans (order_id, product_id, qty_scanned, scanned_at)
       VALUES ($1, $2, 1, CURRENT_TIMESTAMP)
       ON CONFLICT (order_id, product_id)
       DO UPDATE SET qty_scanned = pack_scans.qty_scanned + 1, scanned_at = CURRENT_TIMESTAMP
       RETURNING qty_scanned`,
      [order.id, product.id]
    );

    await client.query('COMMIT');

    const scannedQty = parseInt(upsertRes.rows[0].qty_scanned, 10);
    const remaining = orderedQty - scannedQty;

    // f. Build progress & running_bill:
    // progress: { scanned_total, ordered_total }
    // running_bill: { lines: [{product_id, name, qty, unit_price, line_total}], total } where unit prices come from order.items
    const allScansRes = await query(
      `SELECT ps.product_id, ps.qty_scanned, p.name AS product_name, p.price AS product_price
       FROM pack_scans ps
       JOIN products p ON ps.product_id = p.id
       WHERE ps.order_id = $1 AND ps.qty_scanned > 0
       ORDER BY ps.id ASC`,
      [order.id]
    );

    const orderedTotal = orderItems.reduce((acc, it) => acc + parseInt(it.qty || it.quantity || 1, 10), 0);
    const scannedTotal = allScansRes.rows.reduce((acc, row) => acc + parseInt(row.qty_scanned, 10), 0);

    const lines = allScansRes.rows.map((row) => {
      const oi = orderItems.find((it) => Number(it.product_id) === Number(row.product_id));
      const unitPrice = oi ? parseFloat(oi.price || oi.unit_price || row.product_price) : parseFloat(row.product_price);
      const qty = parseInt(row.qty_scanned, 10);
      const lineTotal = parseFloat((qty * unitPrice).toFixed(2));
      return {
        product_id: parseInt(row.product_id, 10),
        name: oi?.name || row.product_name,
        qty,
        unit_price: unitPrice,
        line_total: lineTotal,
      };
    });

    const runningBillTotal = parseFloat(lines.reduce((acc, l) => acc + l.line_total, 0).toFixed(2));

    return res.json({
      product: {
        id: product.id,
        name: product.name,
        price: parseFloat(product.price),
      },
      scanned_qty: scannedQty,
      ordered_qty: orderedQty,
      remaining,
      progress: {
        scanned_total: scannedTotal,
        ordered_total: orderedTotal,
      },
      running_bill: {
        lines,
        total: runningBillTotal,
      },
    });
  } catch (error) {
    try { await client.query('ROLLBACK'); } catch (_) {}
    next(error);
  } finally {
    client.release();
  }
}

/**
 * GET /api/orders/:id/bill
 * Returns customer bill built from pack_scans JOIN products plus shops row.
 * Roles: seller / admin.
 */
async function getOrderBill(req, res, next) {
  try {
    const { id } = req.params;

    const orderRes = await query(
      `SELECT o.*, s.name AS shop_name, s.address AS shop_address, s.seller_id
       FROM orders o
       JOIN shops s ON o.shop_id = s.id
       WHERE o.id = $1`,
      [id]
    );

    if (orderRes.rows.length === 0) {
      return res.status(404).json({ error: 'Order not found' });
    }

    const order = orderRes.rows[0];

    if (order.seller_id !== req.user.id && req.user.role !== 'admin') {
      return res.status(403).json({ error: 'Forbidden: You do not own the shop for this order' });
    }

    const orderItems = typeof order.items === 'string' ? JSON.parse(order.items) : order.items;

    const scansRes = await query(
      `SELECT ps.qty_scanned, p.id AS product_id, p.name, p.price
       FROM pack_scans ps
       JOIN products p ON ps.product_id = p.id
       WHERE ps.order_id = $1 AND ps.qty_scanned > 0
       ORDER BY ps.id ASC`,
      [id]
    );

    const lines = scansRes.rows.map((row) => {
      const oi = Array.isArray(orderItems)
        ? orderItems.find((it) => Number(it.product_id) === Number(row.product_id))
        : null;
      const unitPrice = oi ? parseFloat(oi.price || oi.unit_price || row.price) : parseFloat(row.price);
      const qtyScanned = parseInt(row.qty_scanned, 10);
      const lineTotal = parseFloat((qtyScanned * unitPrice).toFixed(2));
      return {
        name: oi?.name || row.name,
        qty_scanned: qtyScanned,
        unit_price: unitPrice,
        line_total: lineTotal,
      };
    });

    const total = parseFloat(lines.reduce((acc, l) => acc + l.line_total, 0).toFixed(2));

    return res.json({
      shop: {
        name: order.shop_name,
        address: order.shop_address,
      },
      order_id: parseInt(order.id, 10),
      date: order.created_at,
      lines,
      total,
      status: order.status,
    });
  } catch (error) {
    next(error);
  }
}

/**
 * POST /api/orders/:id/confirm-pack
 * Seller confirms packing complete after scanning all ordered items.
 * Checks that every item in order.items has scanned_qty >= ordered qty.
 * Transitions accepted -> packed via transitionOrder.
 */
async function confirmPack(req, res, next) {
  const client = await getClient();
  try {
    const { id } = req.params;

    const orderRes = await query(
      `SELECT o.*, s.seller_id
       FROM orders o
       JOIN shops s ON o.shop_id = s.id
       WHERE o.id = $1`,
      [id]
    );

    if (orderRes.rows.length === 0) {
      return res.status(404).json({ error: 'Order not found' });
    }

    const order = orderRes.rows[0];

    if (order.seller_id !== req.user.id && req.user.role !== 'admin') {
      return res.status(403).json({ error: 'Forbidden: You do not own the shop for this order' });
    }

    const orderItems = typeof order.items === 'string' ? JSON.parse(order.items) : order.items;
    if (!Array.isArray(orderItems) || orderItems.length === 0) {
      return res.status(400).json({ error: 'Order has no items' });
    }

    const scansRes = await query(
      'SELECT product_id, qty_scanned FROM pack_scans WHERE order_id = $1',
      [id]
    );
    const scanMap = new Map();
    for (const r of scansRes.rows) {
      scanMap.set(Number(r.product_id), parseInt(r.qty_scanned, 10));
    }

    // Resolve any product names from products table if missing in order.items
    const productIds = orderItems.map((it) => it.product_id).filter(Boolean);
    let prodNameMap = new Map();
    if (productIds.length > 0) {
      const prodRes = await query(
        'SELECT id, name FROM products WHERE id = ANY($1::int[])',
        [productIds]
      );
      for (const p of prodRes.rows) {
        prodNameMap.set(Number(p.id), p.name);
      }
    }

    const pending = [];
    let totalItemsPacked = 0;

    for (const item of orderItems) {
      const pId = Number(item.product_id);
      const ordered = parseInt(item.qty || item.quantity || 1, 10);
      const scanned = scanMap.get(pId) || 0;
      const name = item.name || prodNameMap.get(pId) || `Product ${pId}`;

      if (scanned < ordered) {
        pending.push({
          product_id: item.product_id,
          name,
          ordered,
          scanned,
        });
      } else {
        totalItemsPacked += scanned;
      }
    }

    if (pending.length > 0) {
      return res.status(400).json({
        error: 'Cannot confirm pack: some items have not been fully scanned',
        pending,
      });
    }

    await client.query('BEGIN');
    let updatedOrder;
    try {
      updatedOrder = await transitionOrder(client, id, 'packed', req.user.role);
    } catch (transErr) {
      await client.query('ROLLBACK');
      return res.status(transErr.status || 400).json({ error: transErr.message });
    }
    await client.query('COMMIT');

    return res.json({
      order_id: parseInt(updatedOrder.id, 10),
      status: 'packed',
      items_packed: totalItemsPacked,
      total: parseFloat(updatedOrder.total),
    });
  } catch (error) {
    try { await client.query('ROLLBACK'); } catch (_) {}
    next(error);
  } finally {
    client.release();
  }
}

module.exports = {
  createOrder,
  listOrders,
  getOrderById,
  updateOrderStatus,
  assignDelivery,
  transitionOrder,
  transitionOrderStatus: transitionOrder,
  isValidOrderStatusTransition,
  SELLER_LEGAL_TRANSITIONS,
  packScan,
  getOrderBill,
  confirmPack,
};
