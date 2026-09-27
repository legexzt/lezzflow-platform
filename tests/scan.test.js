process.env.NODE_ENV = 'test';

const request = require('supertest');
const app = require('../app');
const { bedrockClient } = require('../config/aws');
const { parseModelJson } = require('../services/bedrockService');

describe('Scan Endpoints (AI & Barcode) Mocked Tests', () => {
  beforeEach(() => {
    jest.restoreAllMocks();
  });

  describe('Bedrock JSON Parsing Unit Tests', () => {
    it('should parse clean JSON', () => {
      const input = '{"name": "Organic Honey", "category": "Pantry", "description": "Raw organic honey"}';
      const result = parseModelJson(input);
      expect(result).toEqual({
        name: 'Organic Honey',
        category: 'Pantry',
        description: 'Raw organic honey',
      });
    });

    it('should parse JSON wrapped in markdown code fences', () => {
      const input = '```json\n{"name": "Whole Wheat Bread", "category": "Bakery", "description": "Freshly baked wheat bread"}\n```';
      const result = parseModelJson(input);
      expect(result).toEqual({
        name: 'Whole Wheat Bread',
        category: 'Bakery',
        description: 'Freshly baked wheat bread',
      });
    });

    it('should parse JSON with commentary around it', () => {
      const input = 'Here is the identified product: {"name": "Greek Yogurt", "category": "Dairy", "description": "Plain yogurt"}. Hope this helps!';
      const result = parseModelJson(input);
      expect(result).toEqual({
        name: 'Greek Yogurt',
        category: 'Dairy',
        description: 'Plain yogurt',
      });
    });
  });

  describe('POST /api/scan/ai Endpoint', () => {
    it('should return 400 if no image file is uploaded', async () => {
      const res = await request(app).post('/api/scan/ai');
      expect(res.status).toBe(400);
      expect(res.body.error).toContain('Image file is required');
    });

    it('should call Bedrock Converse API and return parsed product JSON', async () => {
      const mockBedrockResponse = {
        output: {
          message: {
            content: [
              {
                text: JSON.stringify({
                  name: 'Alfonso Mangoes',
                  category: 'Fruits',
                  description: 'Premium fresh organic mango box',
                }),
              },
            ],
          },
        },
      };

      jest.spyOn(bedrockClient, 'send').mockResolvedValue(mockBedrockResponse);

      const fakeImageBuffer = Buffer.from('fake-jpeg-image-bytes');

      const res = await request(app)
        .post('/api/scan/ai')
        .attach('image', fakeImageBuffer, { filename: 'mango.jpg', contentType: 'image/jpeg' });

      expect(res.status).toBe(200);
      expect(res.body).toEqual({
        name: 'Alfonso Mangoes',
        category: 'Fruits',
        description: 'Premium fresh organic mango box',
      });
    });

    it('should handle Bedrock model errors gracefully with 502', async () => {
      jest.spyOn(bedrockClient, 'send').mockRejectedValue(new Error('Bedrock rate limit exceeded'));

      const fakeImageBuffer = Buffer.from('fake-jpeg-image-bytes');

      const res = await request(app)
        .post('/api/scan/ai')
        .attach('image', fakeImageBuffer, { filename: 'product.jpg', contentType: 'image/jpeg' });

      expect(res.status).toBe(502);
      expect(res.body.error).toContain('AI product scanner failed');
      expect(res.body.details).toContain('Bedrock rate limit exceeded');
    });
  });

  describe('POST /api/scan/barcode Endpoint', () => {
    it('should return 400 if code parameter is missing', async () => {
      const res = await request(app).post('/api/scan/barcode').send({});
      expect(res.status).toBe(400);
      expect(res.body.error).toContain('Barcode code is required');
    });

    it('should return product details when found on OpenFoodFacts', async () => {
      const mockOffResponse = {
        status: 1,
        product: {
          product_name: 'Nutella Hazelnut Spread',
          brands: 'Ferrero',
          image_url: 'https://images.openfoodfacts.org/images/products/3017620422003/front.jpg',
        },
      };

      jest.spyOn(global, 'fetch').mockResolvedValue({
        ok: true,
        status: 200,
        json: jest.fn().mockResolvedValue(mockOffResponse),
      });

      const res = await request(app)
        .post('/api/scan/barcode')
        .send({ code: '3017620422003' });

      expect(res.status).toBe(200);
      expect(res.body).toEqual({
        found: true,
        name: 'Nutella Hazelnut Spread',
        brands: 'Ferrero',
        image: 'https://images.openfoodfacts.org/images/products/3017620422003/front.jpg',
      });
    });

    it('should return { found: false } when barcode not found', async () => {
      const mockOffResponse = {
        status: 0,
        status_verbose: 'product not found',
      };

      jest.spyOn(global, 'fetch').mockResolvedValue({
        ok: true,
        status: 200,
        json: jest.fn().mockResolvedValue(mockOffResponse),
      });

      const res = await request(app)
        .post('/api/scan/barcode')
        .send({ code: '9999999999999' });

      expect(res.status).toBe(200);
      expect(res.body).toEqual({ found: false });
    });

    it('should return { found: false } gracefully on OpenFoodFacts network error', async () => {
      jest.spyOn(global, 'fetch').mockRejectedValue(new Error('Network connection error'));

      const res = await request(app)
        .post('/api/scan/barcode')
        .send({ code: '3017620422003' });

      expect(res.status).toBe(200);
      expect(res.body).toEqual({ found: false });
    });
  });
});
