const fs = require('fs');
const path = require('path');
const { S3Client, PutObjectCommand, GetObjectCommand } = require('@aws-sdk/client-s3');
const { getSignedUrl } = require('@aws-sdk/s3-request-presigner');
require('dotenv').config({ quiet: true });

class LocalStorageProvider {
  constructor() {
    this.uploadDir = path.resolve(process.env.UPLOAD_DIR || path.join(__dirname, '..', 'uploads'));
    if (!fs.existsSync(this.uploadDir)) {
      fs.mkdirSync(this.uploadDir, { recursive: true });
    }
  }

  async saveFile(file) {
    // If multer already saved the file to disk via diskStorage
    if (file.filename) {
      const relativePath = `/uploads/${file.filename}`;
      return {
        url: relativePath,
        filename: file.filename,
        storage: 'local',
      };
    }

    // If file is in memory (buffer)
    const ext = path.extname(file.originalname || '') || '.bin';
    const filename = `${Date.now()}-${Math.round(Math.random() * 1e9)}${ext}`;
    const destination = path.join(this.uploadDir, filename);

    await fs.promises.writeFile(destination, file.buffer);

    return {
      url: `/uploads/${filename}`,
      filename,
      storage: 'local',
    };
  }
}

class S3StorageProvider {
  constructor() {
    const bucket = process.env.AWS_S3_BUCKET;
    if (!bucket || !bucket.trim()) {
      throw new Error(
        'STORAGE_PROVIDER=s3 is configured but AWS_S3_BUCKET is not set. ' +
        'Set AWS_S3_BUCKET to the name of a private S3 bucket before starting the server.'
      );
    }
    this.bucket = bucket.trim();
    this.region = process.env.AWS_REGION || 'ap-south-1';
    this.s3 = new S3Client({ region: this.region });
  }

  /**
   * Generate a presigned GET URL for an object in the bucket.
   * The bucket is private, so reads are only possible through these signed URLs.
   */
  async getSignedUrl(key, expiresInSeconds = 900) {
    const command = new GetObjectCommand({ Bucket: this.bucket, Key: key });
    return getSignedUrl(this.s3, command, { expiresIn: expiresInSeconds });
  }

  async saveFile(file) {
    if (!file) {
      throw new Error('No file provided for upload');
    }

    const body = file.buffer
      ? file.buffer
      : file.path
        ? await fs.promises.readFile(file.path)
        : null;
    if (!body) {
      throw new Error('Cannot upload to S3: file has neither a buffer nor a disk path');
    }

    const ext = path.extname(file.originalname || '') || '.bin';
    const key = `uploads/${Date.now()}-${Math.round(Math.random() * 1e9)}${ext}`;

    await this.s3.send(
      new PutObjectCommand({
        Bucket: this.bucket,
        Key: key,
        Body: body,
        ContentType: file.mimetype || 'application/octet-stream',
      })
    );

    // The bucket is private: only hand out a time-limited presigned GET URL.
    const url = await this.getSignedUrl(key);

    return {
      url,
      filename: key,
      storage: 's3',
    };
  }
}

class StorageService {
  constructor() {
    const providerType = (process.env.STORAGE_PROVIDER || 'local').toLowerCase();
    if (providerType === 's3') {
      this.provider = new S3StorageProvider();
    } else {
      this.provider = new LocalStorageProvider();
    }
  }

  async upload(file) {
    if (!file) {
      throw new Error('No file provided for upload');
    }
    return this.provider.saveFile(file);
  }
}

const defaultStorageService = new StorageService();

module.exports = {
  StorageService,
  LocalStorageProvider,
  S3StorageProvider,
  storageService: defaultStorageService,
};
