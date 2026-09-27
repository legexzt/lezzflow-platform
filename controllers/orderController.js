const { query } = require('../db');

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
 * POST /api/orders
 * Customer creates a new order
 */
async function createOrder(req, res, next) {
  try {
    const { shop_id, items, fulfillment, total } = req.body;

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

    if (!Array.isArray(items) || items.length === 0) {
      return res.status(400).json({
        error: 'items must be a non-empty array',
      });
    }

    // Verify shop exists
    const shopResult = await query('SELECT * FROM shops WHERE id = $1', [shop_id]);
    if (shopResult.rows.length === 0) {
      return res.status(404).json({ error: 'Shop not found' });
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

    const itemsJson = typeof items === 'string' ? items : JSON.stringify(items);

    const result = await query(
      `INSERT INTO orders (customer_id, shop_id, items, fulfillment, total, status)
       VALUES ($1, $2, $3, $4, $5, 'placed')
       RETURNING *`,
      [req.user.id, shop_id, itemsJson, fulfillment, calculatedTotal]
    );

    return res.status(201).json(result.rows[0]);
  } catch (error) {
    next(error);
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
        `SELECT o.*, s.name as shop_name 
         FROM orders o 
         JOIN shops s ON o.shop_id = s.id 
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
 * Enforces legal transitions strictly.
 */
async function updateOrderStatus(req, res, next) {
  try {
    const { id } = req.params;
    const { status } = req.body;

    if (!status) {
      return res.status(400).json({ error: 'status is required' });
    }

    const orderResult = await query(
      `SELECT o.*, s.seller_id 
       FROM orders o 
       JOIN shops s ON o.shop_id = s.id 
       WHERE o.id = $1`,
      [id]
    );

    if (orderResult.rows.length === 0) {
      return res.status(404).json({ error: 'Order not found' });
    }

    const order = orderResult.rows[0];

    // Verify seller owns the shop (or is admin)
    if (order.seller_id !== req.user.id && req.user.role !== 'admin') {
      return res.status(403).json({ error: 'Forbidden: You do not own the shop for this order' });
    }

    const currentStatus = order.status;
    const targetStatus = status.toLowerCase();

    if (!isValidOrderStatusTransition(currentStatus, targetStatus, req.user.role)) {
      return res.status(400).json({
        error: `Invalid status transition from '${currentStatus}' to '${targetStatus}'. Legal next transitions: [${(SELLER_LEGAL_TRANSITIONS[currentStatus] || []).join(', ')}]`,
      });
    }

    const updated = await query(
      `UPDATE orders 
       SET status = $1, updated_at = CURRENT_TIMESTAMP 
       WHERE id = $2 
       RETURNING *`,
      [targetStatus, id]
    );

    return res.json(updated.rows[0]);
  } catch (error) {
    next(error);
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

module.exports = {
  createOrder,
  listOrders,
  getOrderById,
  updateOrderStatus,
  assignDelivery,
  isValidOrderStatusTransition,
  SELLER_LEGAL_TRANSITIONS,
};
