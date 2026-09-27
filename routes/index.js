const express = require('express');
const router = express.Router();

const authRoutes = require('./authRoutes');
const shopRoutes = require('./shopRoutes');
const productRoutes = require('./productRoutes');
const discoverRoutes = require('./discoverRoutes');
const orderRoutes = require('./orderRoutes');
const deliveryRoutes = require('./deliveryRoutes');
const adminRoutes = require('./adminRoutes');
const kycRoutes = require('./kycRoutes');
const scanRoutes = require('./scanRoutes');
const uploadRoutes = require('./uploadRoutes');
const advisoryRoutes = require('./advisoryRoutes');

// Mount sub-routes under /api
router.use('/auth', authRoutes);
router.use('/shops', shopRoutes);
router.use('/products', productRoutes);
router.use('/discover', discoverRoutes);
router.use('/orders', orderRoutes);
router.use('/delivery', deliveryRoutes);
router.use('/admin', adminRoutes);
router.use('/', kycRoutes); // /api/kyc, /api/admin/kyc/...
router.use('/scan', scanRoutes);
router.use('/upload', uploadRoutes);
router.use('/advisory', advisoryRoutes);

// Payment coming soon endpoint
router.get('/payment', (req, res) => {
  res.json({
    status: 'coming_soon',
    message: 'Payment coming soon',
  });
});

module.exports = router;
