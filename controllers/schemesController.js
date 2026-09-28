const { query } = require('../db');
const { randomUUID } = require('crypto');

/**
 * Helper: validate and parse pagination parameters (same convention as adminController)
 */
function parsePagination(q) {
  let page = 1;
  let limit = 20;

  if (q.page !== undefined) {
    const pageNum = Number(q.page);
    if (!Number.isInteger(pageNum) || pageNum < 1) {
      return { error: 'page must be a positive integer' };
    }
    page = pageNum;
  }

  if (q.limit !== undefined) {
    const limitNum = Number(q.limit);
    if (!Number.isInteger(limitNum) || limitNum < 1 || limitNum > 100) {
      return { error: 'limit must be an integer between 1 and 100' };
    }
    limit = limitNum;
  }

  const offset = (page - 1) * limit;
  return { page, limit, offset };
}

// ---------------------------------------------------------------------------
// Public endpoints
// ---------------------------------------------------------------------------

/**
 * GET /api/schemes
 * Public. Returns active schemes (status='active' AND is_active=true).
 * Optional: ?category=<text>
 */
async function listSchemes(req, res, next) {
  try {
    const { category } = req.query;
    const params = [];
    const whereClauses = ["status = 'active'", 'is_active = true'];

    if (category && String(category).trim()) {
      params.push(String(category).trim());
      whereClauses.push(`category = $${params.length}`);
    }

    const sql = `SELECT * FROM government_schemes
                 WHERE ${whereClauses.join(' AND ')}
                 ORDER BY created_at ASC`;
    const result = await query(sql, params);
    return res.json(result.rows);
  } catch (error) {
    next(error);
  }
}

/**
 * GET /api/schemes/:id
 * Public detail. Returns 404 if not found or not active.
 */
async function getScheme(req, res, next) {
  try {
    const { id } = req.params;
    const result = await query(
      "SELECT * FROM government_schemes WHERE id = $1 AND status = 'active' AND is_active = true",
      [id]
    );
    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Scheme not found' });
    }
    return res.json(result.rows[0]);
  } catch (error) {
    next(error);
  }
}

// ---------------------------------------------------------------------------
// Admin endpoints
// ---------------------------------------------------------------------------

/**
 * GET /api/admin/schemes
 * Admin: all schemes including inactive/check.
 */
async function adminListSchemes(req, res, next) {
  try {
    const result = await query(
      'SELECT * FROM government_schemes ORDER BY created_at DESC'
    );
    return res.json(result.rows);
  } catch (error) {
    next(error);
  }
}

/**
 * POST /api/admin/schemes
 * Admin: create a new scheme.
 */
async function adminCreateScheme(req, res, next) {
  try {
    const {
      title,
      description = null,
      category = null,
      eligibility = null,
      benefits = null,
      apply_url = null,
      source_url = null,
      status = 'active',
      valid_from = null,
      valid_to = null,
      is_active = true,
    } = req.body || {};

    if (!title || !String(title).trim()) {
      return res.status(400).json({ error: 'title is required' });
    }
    if (!['active', 'check'].includes(status)) {
      return res.status(400).json({ error: "status must be 'active' or 'check'" });
    }

    const result = await query(
      `INSERT INTO government_schemes
         (id, title, description, category, eligibility, benefits, apply_url, source_url, status, valid_from, valid_to, is_active)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12)
       RETURNING *`,
      [
        randomUUID(), // explicit: pg-mem caches gen_random_uuid() DEFAULT per query, causing dup keys
        String(title).trim(),
        description || null,
        category || null,
        eligibility || null,
        benefits || null,
        apply_url || null,
        source_url || null,
        status,
        valid_from || null,
        valid_to || null,
        is_active !== false,
      ]
    );
    return res.status(201).json(result.rows[0]);
  } catch (error) {
    next(error);
  }
}

/**
 * PATCH /api/admin/schemes/:id
 * Admin: update a scheme.
 */
async function adminUpdateScheme(req, res, next) {
  try {
    const { id } = req.params;
    const existing = await query('SELECT * FROM government_schemes WHERE id = $1', [id]);
    if (existing.rows.length === 0) {
      return res.status(404).json({ error: 'Scheme not found' });
    }

    const allowed = [
      'title', 'description', 'category', 'eligibility', 'benefits',
      'apply_url', 'source_url', 'status', 'valid_from', 'valid_to', 'is_active',
    ];
    const sets = [];
    const params = [];

    for (const key of allowed) {
      if (req.body && req.body[key] !== undefined) {
        if (key === 'status' && !['active', 'check'].includes(req.body[key])) {
          return res.status(400).json({ error: "status must be 'active' or 'check'" });
        }
        params.push(req.body[key]);
        sets.push(`${key} = $${params.length}`);
      }
    }

    if (sets.length === 0) {
      return res.status(400).json({ error: 'Nothing to update' });
    }

    sets.push('updated_at = now()');
    params.push(id);

    const result = await query(
      `UPDATE government_schemes SET ${sets.join(', ')} WHERE id = $${params.length} RETURNING *`,
      params
    );
    return res.json(result.rows[0]);
  } catch (error) {
    next(error);
  }
}

/**
 * DELETE /api/admin/schemes/:id
 * Admin: soft-delete (set is_active = false).
 */
async function adminDeleteScheme(req, res, next) {
  try {
    const { id } = req.params;
    const result = await query(
      "UPDATE government_schemes SET is_active = false, updated_at = now() WHERE id = $1 RETURNING *",
      [id]
    );
    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Scheme not found' });
    }
    return res.json({ message: 'Scheme deactivated', scheme: result.rows[0] });
  } catch (error) {
    next(error);
  }
}

module.exports = {
  listSchemes,
  getScheme,
  adminListSchemes,
  adminCreateScheme,
  adminUpdateScheme,
  adminDeleteScheme,
};
