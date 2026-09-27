const { query } = require('../db');

const VALID_ROLES = ['seller', 'customer', 'partner', 'admin'];

/**
 * Helper to validate and parse pagination parameters
 * @param {object} query - Request query parameters
 * @returns {object} { page, limit, offset, error }
 */
function parsePagination(query) {
  let page = 1;
  let limit = 20;

  if (query.page !== undefined) {
    const pageNum = Number(query.page);
    if (!Number.isInteger(pageNum) || pageNum < 1) {
      return { error: 'page must be a positive integer' };
    }
    page = pageNum;
  }

  if (query.limit !== undefined) {
    const limitNum = Number(query.limit);
    if (!Number.isInteger(limitNum) || limitNum < 1 || limitNum > 100) {
      return { error: 'limit must be an integer between 1 and 100' };
    }
    limit = limitNum;
  }

  const offset = (page - 1) * limit;
  return { page, limit, offset };
}

/**
 * GET /api/admin/stats
 * Return overall platform metrics
 */
async function getAdminStats(req, res, next) {
  try {
    const shopsRes = await query('SELECT COUNT(*) FROM shops');
    const productsRes = await query('SELECT COUNT(*) FROM products');
    const ordersRes = await query('SELECT COUNT(*) FROM orders');
    const usersByRoleRes = await query('SELECT role, COUNT(*) FROM users GROUP BY role');
    const pendingKycRes = await query("SELECT COUNT(*) FROM partner_kyc WHERE status = 'pending'");
    const ordersByStatusRes = await query('SELECT status, COUNT(*) FROM orders GROUP BY status');

    const usersByRole = {
      seller: 0,
      customer: 0,
      partner: 0,
      admin: 0,
    };
    for (const row of usersByRoleRes.rows) {
      if (Object.prototype.hasOwnProperty.call(usersByRole, row.role)) {
        usersByRole[row.role] = parseInt(row.count, 10) || 0;
      }
    }

    const ordersByStatus = {};
    for (const row of ordersByStatusRes.rows) {
      ordersByStatus[row.status] = parseInt(row.count, 10) || 0;
    }

    return res.json({
      shops: parseInt(shopsRes.rows[0].count, 10) || 0,
      products: parseInt(productsRes.rows[0].count, 10) || 0,
      orders: parseInt(ordersRes.rows[0].count, 10) || 0,
      usersByRole,
      pendingKyc: parseInt(pendingKycRes.rows[0].count, 10) || 0,
      ordersByStatus,
    });
  } catch (error) {
    next(error);
  }
}

/**
 * GET /api/admin/shops
 * Paginated list of all shops with seller details
 */
async function listAllShops(req, res, next) {
  try {
    const pagination = parsePagination(req.query);
    if (pagination.error) {
      return res.status(400).json({ error: pagination.error });
    }
    const { page, limit, offset } = pagination;

    const { search } = req.query;
    const whereClauses = [];
    const params = [];

    if (search && search.trim()) {
      params.push(`%${search.trim()}%`);
      whereClauses.push(`(LOWER(s.name) LIKE LOWER($${params.length}) OR LOWER(s.address) LIKE LOWER($${params.length}))`);
    }

    let countSql = 'SELECT COUNT(*) FROM shops s JOIN users u ON s.seller_id = u.id';
    let dataSql = `SELECT s.id, s.name, s.address, s.lat, s.lng, s.is_open, s.created_at, s.updated_at,
                          u.id as seller_id, u.name as seller_name, u.phone as seller_phone
                   FROM shops s
                   JOIN users u ON s.seller_id = u.id`;

    if (whereClauses.length > 0) {
      const whereSql = ' WHERE ' + whereClauses.join(' AND ');
      countSql += whereSql;
      dataSql += whereSql;
    }

    const countRes = await query(countSql, params);
    const total = parseInt(countRes.rows[0].count, 10) || 0;
    const totalPages = Math.ceil(total / limit);

    const queryParams = [...params, limit, offset];
    dataSql += ` ORDER BY s.id DESC LIMIT $${params.length + 1} OFFSET $${params.length + 2}`;

    const dataRes = await query(dataSql, queryParams);
    const data = dataRes.rows.map(row => ({
      id: row.id,
      name: row.name,
      address: row.address,
      lat: row.lat,
      lng: row.lng,
      is_open: row.is_open,
      created_at: row.created_at,
      updated_at: row.updated_at,
      seller: {
        id: row.seller_id,
        name: row.seller_name,
        phone: row.seller_phone,
      },
    }));

    return res.json({
      data,
      pagination: {
        page,
        limit,
        total,
        totalPages,
      },
    });
  } catch (error) {
    next(error);
  }
}

/**
 * GET /api/admin/orders
 * Paginated list of all orders with shop and customer details
 */
async function listAllOrders(req, res, next) {
  try {
    const pagination = parsePagination(req.query);
    if (pagination.error) {
      return res.status(400).json({ error: pagination.error });
    }
    const { page, limit, offset } = pagination;

    const { status } = req.query;
    const whereClauses = [];
    const params = [];

    if (status) {
      params.push(status);
      whereClauses.push(`o.status = $${params.length}`);
    }

    let countSql = `SELECT COUNT(*) FROM orders o
                    JOIN shops s ON o.shop_id = s.id
                    JOIN users u ON o.customer_id = u.id`;
    let dataSql = `SELECT o.id, o.customer_id, o.shop_id, o.items, o.status, o.fulfillment, o.total, o.created_at, o.updated_at,
                          s.id as shop_shop_id, s.name as shop_name,
                          u.id as customer_user_id, u.name as customer_name, u.phone as customer_phone
                   FROM orders o
                   JOIN shops s ON o.shop_id = s.id
                   JOIN users u ON o.customer_id = u.id`;

    if (whereClauses.length > 0) {
      const whereSql = ' WHERE ' + whereClauses.join(' AND ');
      countSql += whereSql;
      dataSql += whereSql;
    }

    const countRes = await query(countSql, params);
    const total = parseInt(countRes.rows[0].count, 10) || 0;
    const totalPages = Math.ceil(total / limit);

    const queryParams = [...params, limit, offset];
    dataSql += ` ORDER BY o.id DESC LIMIT $${params.length + 1} OFFSET $${params.length + 2}`;

    const dataRes = await query(dataSql, queryParams);
    const data = dataRes.rows.map(row => ({
      id: row.id,
      customer_id: row.customer_id,
      shop_id: row.shop_id,
      items: typeof row.items === 'string' ? JSON.parse(row.items) : row.items,
      status: row.status,
      fulfillment: row.fulfillment,
      total: row.total,
      created_at: row.created_at,
      updated_at: row.updated_at,
      shop: {
        id: row.shop_shop_id,
        name: row.shop_name,
      },
      customer: {
        id: row.customer_user_id,
        name: row.customer_name,
        phone: row.customer_phone,
      },
    }));

    return res.json({
      data,
      pagination: {
        page,
        limit,
        total,
        totalPages,
      },
    });
  } catch (error) {
    next(error);
  }
}

/**
 * GET /api/admin/users
 * Paginated list of all users with optional role filtering
 */
async function listAllUsers(req, res, next) {
  try {
    const pagination = parsePagination(req.query);
    if (pagination.error) {
      return res.status(400).json({ error: pagination.error });
    }
    const { page, limit, offset } = pagination;

    const { role } = req.query;
    const whereClauses = [];
    const params = [];

    if (role !== undefined) {
      if (!VALID_ROLES.includes(role)) {
        return res.status(400).json({
          error: `Invalid role '${role}'. Allowed roles: ${VALID_ROLES.join(', ')}`,
        });
      }
      params.push(role);
      whereClauses.push(`role = $${params.length}`);
    }

    let countSql = 'SELECT COUNT(*) FROM users';
    let dataSql = 'SELECT id, firebase_uid, role, name, phone, created_at, updated_at FROM users';

    if (whereClauses.length > 0) {
      const whereSql = ' WHERE ' + whereClauses.join(' AND ');
      countSql += whereSql;
      dataSql += whereSql;
    }

    const countRes = await query(countSql, params);
    const total = parseInt(countRes.rows[0].count, 10) || 0;
    const totalPages = Math.ceil(total / limit);

    const queryParams = [...params, limit, offset];
    dataSql += ` ORDER BY id DESC LIMIT $${params.length + 1} OFFSET $${params.length + 2}`;

    const dataRes = await query(dataSql, queryParams);
    const data = dataRes.rows.map(row => ({
      id: row.id,
      firebase_uid: row.firebase_uid,
      role: row.role,
      name: row.name,
      phone: row.phone,
      created_at: row.created_at,
      updated_at: row.updated_at,
    }));

    return res.json({
      data,
      pagination: {
        page,
        limit,
        total,
        totalPages,
      },
    });
  } catch (error) {
    next(error);
  }
}

/**
 * GET /api/admin/products
 * Paginated list of all products with shop details and optional shopId filtering
 */
async function listAllProducts(req, res, next) {
  try {
    const pagination = parsePagination(req.query);
    if (pagination.error) {
      return res.status(400).json({ error: pagination.error });
    }
    const { page, limit, offset } = pagination;

    const { shopId } = req.query;
    const whereClauses = [];
    const params = [];

    if (shopId !== undefined) {
      const parsedShopId = Number(shopId);
      if (!Number.isInteger(parsedShopId) || parsedShopId < 1) {
        return res.status(400).json({
          error: 'shopId must be a positive integer',
        });
      }
      params.push(parsedShopId);
      whereClauses.push(`p.shop_id = $${params.length}`);
    }

    let countSql = 'SELECT COUNT(*) FROM products p JOIN shops s ON p.shop_id = s.id';
    let dataSql = `SELECT p.id, p.shop_id, p.name, p.category, p.price, p.stock, p.image_url, p.barcode, p.created_at, p.updated_at,
                          s.id as shop_shop_id, s.name as shop_name
                   FROM products p
                   JOIN shops s ON p.shop_id = s.id`;

    if (whereClauses.length > 0) {
      const whereSql = ' WHERE ' + whereClauses.join(' AND ');
      countSql += whereSql;
      dataSql += whereSql;
    }

    const countRes = await query(countSql, params);
    const total = parseInt(countRes.rows[0].count, 10) || 0;
    const totalPages = Math.ceil(total / limit);

    const queryParams = [...params, limit, offset];
    dataSql += ` ORDER BY p.id DESC LIMIT $${params.length + 1} OFFSET $${params.length + 2}`;

    const dataRes = await query(dataSql, queryParams);
    const data = dataRes.rows.map(row => ({
      id: row.id,
      shop_id: row.shop_id,
      name: row.name,
      category: row.category,
      price: row.price,
      stock: row.stock,
      image_url: row.image_url,
      barcode: row.barcode,
      created_at: row.created_at,
      updated_at: row.updated_at,
      shop: {
        id: row.shop_shop_id,
        name: row.shop_name,
      },
    }));

    return res.json({
      data,
      pagination: {
        page,
        limit,
        total,
        totalPages,
      },
    });
  } catch (error) {
    next(error);
  }
}

module.exports = {
  getAdminStats,
  listAllShops,
  listAllOrders,
  listAllUsers,
  listAllProducts,
};
