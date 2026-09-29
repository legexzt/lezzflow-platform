/**
 * Async scan job endpoints (scaling cycle-3).
 *
 * POST /api/v1/scan/jobs — enqueue an AI image scan or barcode lookup.
 *   AI scans: multipart field "image" (uploaded to S3/local storage; only the
 *   storage reference is kept in the job payload — never image bytes), or
 *   JSON { kind: 'ai', s3_key, mimetype } when the client uploaded directly.
 *   Barcode: JSON { kind: 'barcode', code }.
 *   In DEGRADED_MODE the job is parked instead of queued.
 *
 * GET /api/v1/scan/jobs/:id — poll job status + result.
 *
 * The existing synchronous POST /scan/ai and POST /scan/barcode routes keep
 * working unchanged.
 */
const { enqueueScanJob, getScanJob } = require('../services/scanQueue');
const { storageService } = require('../services/storageService');
const { isDegradedMode } = require('../middleware/degradedMode');

function publicJob(job) {
  if (!job) return null;
  return {
    id: job.id,
    kind: job.kind,
    status: job.status,
    result: job.result || null,
    attempts: job.attempts,
    max_attempts: job.max_attempts,
    error: job.error || null,
    created_at: job.created_at,
    updated_at: job.updated_at,
  };
}

async function createScanJob(req, res, next) {
  try {
    const kind = (req.body && req.body.kind) || (req.file ? 'ai' : null);
    if (!['ai', 'barcode'].includes(kind)) {
      return res.status(400).json({
        error: "kind is required and must be 'ai' or 'barcode'",
      });
    }

    let payload = {};
    if (kind === 'ai') {
      if (req.file) {
        // Store the upload in S3 (or local disk); the job keeps only the
        // storage reference, never the image bytes.
        const stored = await storageService.upload(req.file);
        payload =
          stored.storage === 's3'
            ? { s3_key: stored.filename, mimetype: req.file.mimetype }
            : { local_path: stored.filename, mimetype: req.file.mimetype };
      } else if (req.body && req.body.s3_key) {
        payload = { s3_key: String(req.body.s3_key), mimetype: req.body.mimetype || 'image/jpeg' };
      } else if (req.body && req.body.local_path) {
        payload = { local_path: String(req.body.local_path), mimetype: req.body.mimetype || 'image/jpeg' };
      } else {
        return res.status(400).json({
          error: "AI scan needs an 'image' multipart file or a JSON s3_key reference",
        });
      }
    } else {
      const code = req.body && req.body.code;
      if (!code || !String(code).trim()) {
        return res.status(400).json({ error: 'Barcode scan needs { kind: "barcode", code }' });
      }
      payload = { code: String(code).trim() };
    }

    const userId = req.user && req.user.id ? req.user.id : null;
    const parked = isDegradedMode();
    const job = await enqueueScanJob({ userId, kind, payload, parked });

    return res.status(parked ? 202 : 201).json({
      ...publicJob(job),
      ...(parked ? { note: 'Server is in degraded mode; job parked and will run later' } : {}),
    });
  } catch (error) {
    next(error);
  }
}

async function getScanJobStatus(req, res, next) {
  try {
    const job = await getScanJob(req.params.id);
    if (!job) {
      return res.status(404).json({ error: 'Scan job not found' });
    }
    return res.json(publicJob(job));
  } catch (error) {
    next(error);
  }
}

module.exports = {
  createScanJob,
  getScanJobStatus,
};
