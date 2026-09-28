function requireAdminWrite(req, res, next) {
  if (req.firebaseUser && req.firebaseUser.ops_viewer === true) {
    return res.status(403).json({ error: 'Forbidden: ops viewer role is read-only.' });
  }
  next();
}

module.exports = { requireAdminWrite };
