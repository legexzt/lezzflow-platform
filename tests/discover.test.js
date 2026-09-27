process.env.NODE_ENV = 'test';

const request = require('supertest');
const app = require('../app');
const { haversineDistance, groupShopsByDistance } = require('../services/distanceService');
const { setupTestDb, createTestUser, createTestShop } = require('./helpers/testDb');

describe('Discover Endpoint & Distance Layering Math', () => {
  beforeEach(async () => {
    await setupTestDb();
  });

  describe('haversineDistance formula math', () => {
    it('should return 0 distance for the exact same coordinates', () => {
      const distance = haversineDistance(12.9716, 77.5946, 12.9716, 77.5946);
      expect(distance).toBe(0);
    });

    it('should accurately calculate distance between London and Paris (~344 km)', () => {
      // London: 51.5074 N, 0.1278 W (-0.1278)
      // Paris: 48.8566 N, 2.3522 E (2.3522)
      const distance = haversineDistance(51.5074, -0.1278, 48.8566, 2.3522);
      expect(Math.round(distance)).toBe(344);
    });

    it('should accurately calculate a short ~2.5 km distance in Bangalore', () => {
      // MG Road (12.9756, 77.6066) to Indiranagar (12.9784, 77.6408)
      const distance = haversineDistance(12.9756, 77.6066, 12.9784, 77.6408);
      expect(distance).toBeGreaterThan(2.0);
      expect(distance).toBeLessThan(4.5);
    });
  });

  describe('groupShopsByDistance layering math', () => {
    // Base reference coordinate: (12.9716, 77.5946)
    const baseLat = 12.9716;
    const baseLng = 77.5946;

    it('should correctly partition shops into within5km, within10km, and within20km', () => {
      const shops = [
        { id: 1, name: 'Close Shop (< 5km)', lat: 12.9800, lng: 77.6000 }, // ~1.1 km
        { id: 2, name: 'Mid Shop (5-10km)', lat: 13.0300, lng: 77.5946 },  // ~6.5 km
        { id: 3, name: 'Far Shop (10-20km)', lat: 13.1000, lng: 77.5946 }, // ~14.3 km
        { id: 4, name: 'Outside Shop (> 20km)', lat: 13.3000, lng: 77.5946 }, // ~36 km
      ];

      const layers = groupShopsByDistance(shops, baseLat, baseLng);

      expect(layers.within5km).toHaveLength(1);
      expect(layers.within5km[0].name).toBe('Close Shop (< 5km)');
      expect(layers.within5km[0].distance_km).toBeLessThanOrEqual(5);

      expect(layers.within10km).toHaveLength(1);
      expect(layers.within10km[0].name).toBe('Mid Shop (5-10km)');
      expect(layers.within10km[0].distance_km).toBeGreaterThan(5);
      expect(layers.within10km[0].distance_km).toBeLessThanOrEqual(10);

      expect(layers.within20km).toHaveLength(1);
      expect(layers.within20km[0].name).toBe('Far Shop (10-20km)');
      expect(layers.within20km[0].distance_km).toBeGreaterThan(10);
      expect(layers.within20km[0].distance_km).toBeLessThanOrEqual(20);

      // Outside shop (>20km) is not in any layer
      const allShopsInLayers = [
        ...layers.within5km,
        ...layers.within10km,
        ...layers.within20km,
      ];
      expect(allShopsInLayers.find(s => s.id === 4)).toBeUndefined();
    });

    it('should sort shops within each layer by distance ascending', () => {
      const shops = [
        { id: 1, name: 'Shop 4km', lat: 13.0076, lng: 77.5946 }, // ~4 km
        { id: 2, name: 'Shop 1km', lat: 12.9806, lng: 77.5946 }, // ~1 km
        { id: 3, name: 'Shop 2km', lat: 12.9896, lng: 77.5946 }, // ~2 km
      ];

      const layers = groupShopsByDistance(shops, baseLat, baseLng);
      expect(layers.within5km).toHaveLength(3);
      expect(layers.within5km[0].name).toBe('Shop 1km');
      expect(layers.within5km[1].name).toBe('Shop 2km');
      expect(layers.within5km[2].name).toBe('Shop 4km');
    });

    it('should throw an error if lat/lng are invalid', () => {
      expect(() => groupShopsByDistance([], 'invalid', 77.5946)).toThrow(
        'Invalid user latitude or longitude'
      );
    });
  });

  describe('GET /api/discover HTTP Endpoint Integration', () => {
    it('should return 400 if lat or lng are missing', async () => {
      const res = await request(app).get('/api/discover?lat=12.9716');
      expect(res.status).toBe(400);
      expect(res.body.error).toContain('lat and lng query parameters are required');
    });

    it('should return 400 if lat or lng are not numbers', async () => {
      const res = await request(app).get('/api/discover?lat=abc&lng=xyz');
      expect(res.status).toBe(400);
      expect(res.body.error).toContain('must be valid numbers');
    });

    it('should discover only open shops and group them in distance layers', async () => {
      const seller = await createTestUser({
        firebase_uid: 'seller-discover-uid',
        role: 'seller',
      });

      // Shop 1: Open, close (~1.1 km)
      await createTestShop({
        seller_id: seller.id,
        name: 'Open Near Shop',
        lat: 12.9800,
        lng: 77.6000,
        is_open: true,
      });

      // Shop 2: Closed, close (~1.1 km) - should be excluded
      await createTestShop({
        seller_id: seller.id,
        name: 'Closed Near Shop',
        lat: 12.9800,
        lng: 77.6000,
        is_open: false,
      });

      // Shop 3: Open, mid distance (~6.5 km)
      await createTestShop({
        seller_id: seller.id,
        name: 'Open Mid Shop',
        lat: 13.0300,
        lng: 77.5946,
        is_open: true,
      });

      const res = await request(app)
        .get('/api/discover?lat=12.9716&lng=77.5946');

      expect(res.status).toBe(200);
      expect(res.body.within5km).toBeDefined();
      expect(res.body.within10km).toBeDefined();
      expect(res.body.within20km).toBeDefined();

      // Only open near shop in within5km
      expect(res.body.within5km).toHaveLength(1);
      expect(res.body.within5km[0].name).toBe('Open Near Shop');
      expect(res.body.within5km[0].is_open).toBe(true);

      // Only open mid shop in within10km
      expect(res.body.within10km).toHaveLength(1);
      expect(res.body.within10km[0].name).toBe('Open Mid Shop');

      expect(res.body.within20km).toHaveLength(0);
    });
  });
});
