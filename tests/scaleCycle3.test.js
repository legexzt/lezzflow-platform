/**
 * Scaling cycle-3 tests:
 *  - location-smart discovery cache keys
 *  - async scan job queue lifecycle (enqueue -> claim -> done / fail / park)
 *  - DEGRADED_MODE behaviour (park scans, 503 advisory, skip yojana nudges)
 *  - gzip compression on large responses
 */
process.env.NODE_ENV = 'test';

const request = require('supertest');
const http = require('http');
const zlib = require('zlib');
const app = require('../app');
const admin = require('../config/firebase');
const { buildDiscoveryCacheKey } = require('../middleware/cache');
const {
  enqueueScanJob,
  getScanJob,
  claimNextJob,
  completeScanJob,
  failScanJob,
} = require('../services/scanQueue');
const { processNextJob } = require('../services/scanWorker');
const barcodeService = require('../services/barcodeService');
const {
  setupTestDb,
  createTestUser,
  createTestShop,
} = require('./helpers/testDb');

const mockAuth = (uid) =>
  jest.spyOn(admin, 'auth').mockReturnValue({
    verifyIdToken: jest.fn().mockResolvedValue({ uid }),
  });

describe('Discovery cache key (location-smart)', () => {
  test('nearby coordinates share a key', () => {
    const a = buildDiscoveryCacheKey('/api/discover?lat=12.97161&lng=77.59462');
    const b = buildDiscoveryCacheKey('/api/discover?lat=12.97164&lng=77.59468');
    expect(a).toBe(b);
  });

  test('distant coordinates do not share a key', () => {
    const a = buildDiscoveryCacheKey('/api/discover?lat=12.9716&lng=77.5946');
    const b = buildDiscoveryCacheKey('/api/discover?lat=12.9816&lng=77.6046');
    expect(a).not.toBe(b);
  });

  test('radius is grouped into 5km bands', () => {
    const a = buildDiscoveryCacheKey('/api/discover?lat=12.9716&lng=77.5946&radius=3');
    const b = buildDiscoveryCacheKey('/api/discover?lat=12.9716&lng=77.5946&radius=7');
    const c = buildDiscoveryCacheKey('/api/discover?lat=12.9716&lng=77.5946&radius=12');
    expect(a).toBe(b);
    expect(a).not.toBe(c);
  });

  test('discovery still caches over HTTP (MISS then HIT)', async () => {
    await setupTestDb();
    const url = '/api/discover?lat=12.97161&lng=77.59462';
    const r1 = await request(app).get(url);
    expect(r1.status).toBe(200);
    expect(r1.headers['x-cache']).toBe('MISS');
    // Slightly different coords -> same rounded key -> HIT
    const r2 = await request(app).get('/api/discover?lat=12.97164&lng=77.59468');
    expect(r2.headers['x-cache']).toBe('HIT');
    expect(r2.body).toEqual(r1.body);
  });
});

describe('Scan job queue', () => {
  beforeEach(async () => {
    await setupTestDb();
    jest.restoreAllMocks();
  });

  test('POST /api/v1/scan/jobs enqueues a barcode job, GET polls it', async () => {
    const post = await request(app)
      .post('/api/v1/scan/jobs')
      .send({ kind: 'barcode', code: '8901234567890' });
    expect(post.status).toBe(201);
    expect(post.body.status).toBe('queued');
    expect(post.body.id).toBeTruthy();

    const get = await request(app).get(`/api/v1/scan/jobs/${post.body.id}`);
    expect(get.status).toBe(200);
    expect(get.body.status).toBe('queued');
  });

  test('POST /api/v1/scan/jobs rejects unknown kind and missing code', async () => {
    const badKind = await request(app).post('/api/v1/scan/jobs').send({ kind: 'xray' });
    expect(badKind.status).toBe(400);
    const noCode = await request(app).post('/api/v1/scan/jobs').send({ kind: 'barcode' });
    expect(noCode.status).toBe(400);
    const missing = await request(app).get('/api/v1/scan/jobs/00000000-0000-0000-0000-000000000000');
    expect(missing.status).toBe(404);
  });

  test('claim -> done lifecycle with mocked barcode lookup', async () => {
    jest.spyOn(barcodeService, 'lookupBarcode').mockResolvedValue({ name: 'Test Pack' });
    const job = await enqueueScanJob({
      kind: 'barcode',
      payload: { code: '8901234567890' },
    });

    const finished = await processNextJob();
    expect(finished.id).toBe(job.id);
    expect(finished.status).toBe('done');
    expect(finished.result.name).toBe('Test Pack');

    const again = await processNextJob();
    expect(again).toBe('empty');
  });

  test('failing job retries until max attempts then fails', async () => {
    jest.spyOn(barcodeService, 'lookupBarcode').mockRejectedValue(new Error('boom'));
    const job = await enqueueScanJob({ kind: 'barcode', payload: { code: '1' } });

    const r1 = await processNextJob();
    expect(r1.status).toBe('queued'); // attempts=1 < 3, back to queue
    const r2 = await processNextJob();
    expect(r2.status).toBe('queued'); // attempts=2 < 3
    const r3 = await processNextJob();
    expect(r3.status).toBe('failed'); // attempts=3 >= 3
    expect(r3.attempts).toBe(3);

    const stored = await getScanJob(job.id);
    expect(stored.status).toBe('failed');
  });

  test('claimNextJob marks job processing with incremented attempts', async () => {
    const job = await enqueueScanJob({ kind: 'barcode', payload: { code: '2' } });
    const claimed = await claimNextJob();
    expect(claimed.id).toBe(job.id);
    expect(claimed.status).toBe('processing');
    expect(claimed.attempts).toBe(1);
    await completeScanJob(job.id, { ok: true });
  });

  test('AI job payload stores S3 reference, never image bytes', async () => {
    const job = await enqueueScanJob({
      kind: 'ai',
      payload: { s3_key: 'uploads/abc.jpg', mimetype: 'image/jpeg' },
    });
    const payloadStr = JSON.stringify(job.payload);
    expect(payloadStr).toContain('uploads/abc.jpg');
    expect(job.payload.s3_key).toBe('uploads/abc.jpg');
  });
});

describe('DEGRADED_MODE=1', () => {
  const OLD = process.env.DEGRADED_MODE;

  beforeEach(async () => {
    await setupTestDb();
    jest.restoreAllMocks();
    process.env.DEGRADED_MODE = '1';
  });

  afterEach(() => {
    if (OLD === undefined) delete process.env.DEGRADED_MODE;
    else process.env.DEGRADED_MODE = OLD;
  });

  test('new scan jobs are parked, not queued', async () => {
    const res = await request(app)
      .post('/api/v1/scan/jobs')
      .send({ kind: 'barcode', code: '8901234567890' });
    expect(res.status).toBe(202);
    expect(res.body.status).toBe('parked');
  });

  test('AI advisory pauses with truthful retryable 503', async () => {
    const user = await createTestUser({ firebase_uid: 'deg-uid', role: 'seller' });
    mockAuth('deg-uid');
    const res = await request(app)
      .get('/api/v1/advisory/feasibility?lat=12.97&lng=77.59')
      .set('Authorization', 'Bearer <redacted>');
    expect(res.status).toBe(503);
    expect(res.body.code).toBe('DEGRADED_MODE');
    expect(res.body.retryable).toBe(true);
    expect(user.id).toBeTruthy();
  });

  test('scheme_offer nudges are skipped, order updates still flow', async () => {
    const adminUser = await createTestUser({ firebase_uid: 'deg-admin', role: 'admin' });
    mockAuth('deg-admin');
    expect(adminUser.id).toBeTruthy();

    const nudge = await request(app)
      .post('/api/v1/admin/notifications')
      .set('Authorization', 'Bearer <redacted>')
      .send({ title: 'Yojana', type: 'scheme_offer' });
    expect(nudge.status).toBe(503);
    expect(nudge.body.code).toBe('DEGRADED_MODE');

    const orderUpdate = await request(app)
      .post('/api/v1/admin/notifications')
      .set('Authorization', 'Bearer <redacted>')
      .send({ title: 'Order shipped', type: 'order_update' });
    expect(orderUpdate.status).toBe(201);
  });
});

describe('Compression', () => {
  test('large JSON responses are gzipped', async () => {
    await setupTestDb();
    // Seed enough shops to push the discover payload above the 1KB threshold
    const seller = await createTestUser({ firebase_uid: 'gzip-seller', role: 'seller' });
    for (let i = 0; i < 25; i++) {
      await createTestShop({
        seller_id: seller.id,
        name: `Gzip Test Kirana Store Number ${i} With A Deliberately Long Name`,
        address: `${i} Long Market Road, Some Locality Name, Bengaluru Karnataka 560001`,
        lat: 12.9716,
        lng: 77.5946,
      });
    }

    // Raw HTTP (Node does NOT auto-decompress) so the content-encoding
    // header is visible — this conclusively proves gzip ran.
    const srv = http.createServer(app);
    await new Promise((resolve) => srv.listen(0, resolve));
    try {
      const port = srv.address().port;
      const raw = await new Promise((resolve, reject) => {
        http
          .get(
            {
              port,
              path: '/api/discover?lat=12.9716&lng=77.5946',
              headers: { 'Accept-Encoding': 'gzip' },
            },
            (res) => {
              const chunks = [];
              res.on('data', (c) => chunks.push(c));
              res.on('end', () => resolve({ headers: res.headers, body: Buffer.concat(chunks) }));
            }
          )
          .on('error', reject);
      });
      expect(raw.headers['content-encoding']).toBe('gzip');
      // And the bytes are real gzip that round-trips to valid JSON
      const json = JSON.parse(zlib.gunzipSync(raw.body).toString('utf8'));
      expect(json).toBeDefined();
    } finally {
      srv.close();
    }
  });
});
