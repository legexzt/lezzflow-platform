/**
 * storageService.test.js
 *
 * Behavior tests for services/storageService.js.
 *
 * The AWS SDK is fully mocked — no network calls are made.
 * storageService.js loads dotenv and instantiates a default service at require
 * time, so each case requires a fresh copy of the module (jest.resetModules)
 * with a controlled process.env.
 */
const fs = require('fs');
const os = require('os');
const path = require('path');

const mockSend = jest.fn();

jest.mock('@aws-sdk/client-s3', () => ({
  S3Client: jest.fn(),
  PutObjectCommand: jest.fn(),
  GetObjectCommand: jest.fn(),
}));

jest.mock('@aws-sdk/s3-request-presigner', () => ({
  getSignedUrl: jest.fn(),
}));

// NOTE: storageService.js is re-required fresh per test (jest.resetModules), so
// the AWS SDK mock module — and these references — must be re-acquired after
// every reset. `loadStorageService()` below does that and wires the mocks.
let S3Client;
let PutObjectCommand;
let GetObjectCommand;
let presignGetSignedUrl;

const PRESIGNED_URL =
  'https://private-bucket.s3.ap-south-1.fakesigned.example/x?X-Amz-Signature=abc123';

const ENV_KEYS = ['STORAGE_PROVIDER', 'AWS_S3_BUCKET', 'AWS_REGION', 'UPLOAD_DIR'];
let savedEnv = {};

function loadStorageService() {
  jest.resetModules();
  const s3Mock = require('@aws-sdk/client-s3');
  S3Client = s3Mock.S3Client;
  PutObjectCommand = s3Mock.PutObjectCommand;
  GetObjectCommand = s3Mock.GetObjectCommand;
  presignGetSignedUrl = require('@aws-sdk/s3-request-presigner').getSignedUrl;

  mockSend.mockReset();
  mockSend.mockResolvedValue({});
  presignGetSignedUrl.mockReset();
  presignGetSignedUrl.mockResolvedValue(PRESIGNED_URL);
  S3Client.mockReset();
  S3Client.mockImplementation(() => ({ send: mockSend }));

  return require('../services/storageService');
}

beforeEach(() => {
  savedEnv = {};
  for (const key of ENV_KEYS) {
    savedEnv[key] = process.env[key];
    delete process.env[key];
  }
});

afterEach(() => {
  for (const key of ENV_KEYS) {
    if (savedEnv[key] === undefined) {
      delete process.env[key];
    } else {
      process.env[key] = savedEnv[key];
    }
  }
  jest.resetModules();
});

describe('S3StorageProvider', () => {
  const s3Env = () => {
    process.env.STORAGE_PROVIDER = 's3';
    process.env.AWS_S3_BUCKET = 'private-bucket';
  };

  test('(a) uploads the object via PutObjectCommand BEFORE any URL is returned', async () => {
    s3Env();
    const { StorageService } = loadStorageService();
    const service = new StorageService();

    const buffer = Buffer.from('fake-image-bytes');
    const result = await service.upload({
      buffer,
      originalname: 'photo.jpg',
      mimetype: 'image/jpeg',
    });

    // PutObjectCommand was constructed with bucket, key, body and content type
    expect(PutObjectCommand).toHaveBeenCalledTimes(1);
    const putInput = PutObjectCommand.mock.calls[0][0];
    expect(putInput.Bucket).toBe('private-bucket');
    expect(putInput.Key).toMatch(/^uploads\//);
    expect(putInput.Body).toBe(buffer);
    expect(putInput.ContentType).toBe('image/jpeg');
    expect(mockSend).toHaveBeenCalledTimes(1);

    // The presigned GET URL was minted only after the upload succeeded,
    // for the SAME key that was uploaded
    expect(presignGetSignedUrl).toHaveBeenCalledTimes(1);
    const getInput = GetObjectCommand.mock.calls[0][0];
    expect(getInput.Bucket).toBe('private-bucket');
    expect(getInput.Key).toBe(putInput.Key);
    expect(mockSend.mock.invocationCallOrder[0]).toBeLessThan(
      presignGetSignedUrl.mock.invocationCallOrder[0]
    );

    // The returned URL is exactly the presigned GET url, never a constructed public URL
    expect(result.url).toBe(PRESIGNED_URL);
    expect(result.filename).toBe(putInput.Key);
    expect(result.storage).toBe('s3');
    expect(result.url).not.toMatch(/amazonaws\.com/);
  });

  test('(a) reads on-disk multer files (file.path) when no buffer is present', async () => {
    s3Env();
    const { StorageService } = loadStorageService();
    const service = new StorageService();

    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 's3-disk-'));
    const diskPath = path.join(dir, 'doc.pdf');
    fs.writeFileSync(diskPath, Buffer.from('pdf-bytes-from-disk'));

    const result = await service.upload({
      path: diskPath,
      originalname: 'doc.pdf',
      mimetype: 'application/pdf',
    });

    const putInput = PutObjectCommand.mock.calls[0][0];
    expect(Buffer.from(putInput.Body).toString()).toBe('pdf-bytes-from-disk');
    expect(putInput.ContentType).toBe('application/pdf');
    expect(result.storage).toBe('s3');
    expect(result.url).toBe(PRESIGNED_URL);

    fs.rmSync(dir, { recursive: true, force: true });
  });

  test('(a) fails loudly when the S3 upload itself fails', async () => {
    s3Env();
    const { StorageService } = loadStorageService();
    const service = new StorageService();

    mockSend.mockRejectedValue(new Error('AccessDenied'));

    await expect(
      service.upload({ buffer: Buffer.from('x'), originalname: 'a.png', mimetype: 'image/png' })
    ).rejects.toThrow('AccessDenied');
    expect(presignGetSignedUrl).not.toHaveBeenCalled();
  });

  test('getSignedUrl(key) mints a signed GET for the key with 15-minute default expiry', async () => {
    s3Env();
    const { S3StorageProvider } = loadStorageService();
    const provider = new S3StorageProvider();

    const url = await provider.getSignedUrl('uploads/abc.jpg');

    expect(url).toBe(PRESIGNED_URL);
    expect(GetObjectCommand).toHaveBeenCalledTimes(1);
    expect(GetObjectCommand.mock.calls[0][0]).toEqual({
      Bucket: 'private-bucket',
      Key: 'uploads/abc.jpg',
    });
    expect(presignGetSignedUrl).toHaveBeenCalledTimes(1);
    expect(presignGetSignedUrl.mock.calls[0][2]).toEqual({ expiresIn: 900 });
    expect(presignGetSignedUrl.mock.calls[0][0].send).toBe(mockSend);
  });

  test('getSignedUrl(key, seconds) honors a custom expiry', async () => {
    s3Env();
    const { S3StorageProvider } = loadStorageService();
    const provider = new S3StorageProvider();

    await provider.getSignedUrl('uploads/abc.jpg', 60);

    expect(presignGetSignedUrl.mock.calls[0][2]).toEqual({ expiresIn: 60 });
  });

  test('(b) STORAGE_PROVIDER=s3 without AWS_S3_BUCKET throws a clear error at construction', () => {
    process.env.STORAGE_PROVIDER = 's3';
    process.env.AWS_S3_BUCKET = 'private-bucket';
    const { StorageService, S3StorageProvider } = loadStorageService();

    // Drop the bucket after the module loaded: construction must fail now
    delete process.env.AWS_S3_BUCKET;

    expect(() => new S3StorageProvider()).toThrow(/AWS_S3_BUCKET/);
    expect(() => new StorageService()).toThrow(/AWS_S3_BUCKET/);
    expect(() => new StorageService()).toThrow(/STORAGE_PROVIDER=s3/);
    // The module's default export is built at require time, so requiring
    // the module in this state also fails loudly
    expect(() => loadStorageService()).toThrow(/AWS_S3_BUCKET/);
  });

  test('(b) STORAGE_PROVIDER=s3 never silently falls back to local', () => {
    process.env.STORAGE_PROVIDER = 's3';
    process.env.AWS_S3_BUCKET = 'private-bucket';

    const { StorageService } = loadStorageService();
    const service = new StorageService();

    expect(service.provider.constructor.name).toBe('S3StorageProvider');
  });

  test('(d) no public S3 URL is ever constructed or returned', async () => {
    s3Env();
    const { StorageService } = loadStorageService();
    const service = new StorageService();

    const result = await service.upload({
      buffer: Buffer.from('x'),
      originalname: 'a.png',
      mimetype: 'image/png',
    });

    expect(result.url).not.toMatch(/https?:\/\/[^/]*amazonaws\.com/);

    // Static check: the provider code must not build public https://bucket.s3... URLs
    const source = fs.readFileSync(
      path.join(__dirname, '..', 'services', 'storageService.js'),
      'utf8'
    );
    expect(source).not.toMatch(/https?:\/\/[^'"`\s]*amazonaws\.com/);
  });
});

describe('LocalStorageProvider (default, unchanged)', () => {
  test('(c) defaults to local when STORAGE_PROVIDER is unset', () => {
    const { StorageService, LocalStorageProvider } = loadStorageService();
    const service = new StorageService();

    expect(service.provider).toBeInstanceOf(LocalStorageProvider);
    expect(service.provider.constructor.name).toBe('LocalStorageProvider');
  });

  test('(c) passes through multer diskStorage files unchanged', async () => {
    const { StorageService } = loadStorageService();
    const service = new StorageService();

    const result = await service.upload({
      filename: 'kyc-doc-123.png',
      originalname: 'doc.png',
      path: '/tmp/kyc-doc-123.png',
    });

    expect(result).toEqual({
      url: '/uploads/kyc-doc-123.png',
      filename: 'kyc-doc-123.png',
      storage: 'local',
    });
  });

  test('(c) writes memory-buffer files to UPLOAD_DIR and returns a local url', async () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 's3-local-'));
    process.env.UPLOAD_DIR = dir;

    const { StorageService } = loadStorageService();
    const service = new StorageService();

    const bytes = Buffer.from('hello-local');
    const result = await service.upload({
      buffer: bytes,
      originalname: 'note.txt',
      mimetype: 'text/plain',
    });

    expect(result.storage).toBe('local');
    expect(result.url).toBe(`/uploads/${result.filename}`);
    const onDisk = fs.readFileSync(path.join(dir, result.filename));
    expect(onDisk.equals(bytes)).toBe(true);

    fs.rmSync(dir, { recursive: true, force: true });
  });

  test('(c) upload() rejects when no file is provided', async () => {
    const { StorageService } = loadStorageService();
    const service = new StorageService();

    await expect(service.upload(null)).rejects.toThrow('No file provided');
  });
});
