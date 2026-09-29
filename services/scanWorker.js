/**
 * Scan job worker (scaling cycle-3).
 *
 * Polls the scan_jobs queue and processes one job per tick. AI image scans
 * reference an S3 object key in the payload — the worker downloads the bytes
 * itself, so image data never sits in PostgreSQL.
 *
 * Start in production with startScanWorker(); tests call processNextJob()
 * directly. Never auto-starts when NODE_ENV=test.
 */
const fs = require('fs');
const { S3Client, GetObjectCommand } = require('@aws-sdk/client-s3');
const {
  claimNextJob,
  completeScanJob,
  failScanJob,
} = require('./scanQueue');
// NOTE: keep module-object references (not destructured) so tests can
// jest.spyOn these services.
const bedrockService = require('./bedrockService');
const barcodeService = require('./barcodeService');

async function streamToBuffer(stream) {
  const chunks = [];
  for await (const chunk of stream) {
    chunks.push(chunk);
  }
  return Buffer.concat(chunks);
}

async function resolveImageBytes(payload) {
  if (payload.s3_key) {
    const region = process.env.AWS_REGION || 'ap-south-1';
    const bucket = process.env.AWS_S3_BUCKET;
    if (!bucket) {
      throw new Error('AWS_S3_BUCKET is not set; cannot fetch scan image from S3');
    }
    const s3 = new S3Client({ region });
    const out = await s3.send(
      new GetObjectCommand({ Bucket: bucket, Key: payload.s3_key })
    );
    return { buffer: await streamToBuffer(out.Body), mimetype: payload.mimetype || 'image/jpeg' };
  }
  if (payload.local_path) {
    const buffer = await fs.promises.readFile(payload.local_path);
    return { buffer, mimetype: payload.mimetype || 'image/jpeg' };
  }
  throw new Error('Scan job payload has no s3_key or local_path image reference');
}

async function processJob(job) {
  if (job.kind === 'ai') {
    const { buffer, mimetype } = await resolveImageBytes(job.payload || {});
    return bedrockService.scanProductImage(buffer, mimetype);
  }
  if (job.kind === 'barcode') {
    const code = job.payload && job.payload.code;
    if (!code) {
      throw new Error('Barcode scan job is missing payload.code');
    }
    return barcodeService.lookupBarcode(code);
  }
  throw new Error(`Unknown scan job kind: ${job.kind}`);
}

/**
 * Claim and process a single job. Returns the finished job, the string
 * 'empty' when the queue has nothing queued, or throws on unexpected errors.
 */
async function processNextJob() {
  const job = await claimNextJob();
  if (!job) {
    return 'empty';
  }
  try {
    const result = await processJob(job);
    return await completeScanJob(job.id, result);
  } catch (err) {
    return await failScanJob(job.id, err.message);
  }
}

let timer = null;

function startScanWorker(intervalMs = 5000) {
  if (timer) {
    return timer;
  }
  if (process.env.NODE_ENV === 'test') {
    return null;
  }
  timer = setInterval(() => {
    processNextJob().catch((err) => {
      console.error('[scan-worker] tick failed:', err.message);
    });
  }, intervalMs);
  // Don't hold the process open for the worker alone.
  if (timer.unref) {
    timer.unref();
  }
  console.log(`[scan-worker] started (poll every ${intervalMs}ms)`);
  return timer;
}

function stopScanWorker() {
  if (timer) {
    clearInterval(timer);
    timer = null;
  }
}

module.exports = {
  processNextJob,
  startScanWorker,
  stopScanWorker,
};
