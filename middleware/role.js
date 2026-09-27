/**
 * Middleware to restrict endpoint access by user role(s)
 * @param {string|string[]} roles Single role string or array of allowed roles ('seller', 'customer', 'partner', 'admin')
 */
function requireRole(roles) {
  const allowed = Array.isArray(roles) ? roles : [roles];

  return (req, res, next) => {
    if (!req.user) {
      return res.status(401).json({
        error: 'Unauthorized: Authentication required.',
      });
    }

    if (!allowed.includes(req.user.role)) {
      return res.status(403).json({
        error: `Forbidden: Access requires one of the following roles: [${allowed.join(', ')}]. Current role: '${req.user.role}'.`,
      });
    }

    next();
  };
}

module.exports = {
  requireRole,
};
