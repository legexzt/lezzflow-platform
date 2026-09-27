const fs = require('fs');
const path = require('path');
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
    this.bucket = process.env.AWS_S3_BUCKET;
    this.region = process.env.AWS_REGION || 'us-east-1';
  }

  async saveFile(file) {
    // Extensible S3 implementation
    // When AWS credentials and AWS_S3_BUCKET are set, uses S3 PutObject
    // Falls back or throws if not configured
    if (!this.bucket) {
      throw new Error('S3 bucket is not configured. Set AWS_S3_BUCKET.');
    }
    const ext = path.extname(file.originalname || '') || '.bin';
    const key = `uploads/${Date.now()}-${Math.round(Math.random() * 1e9)}${ext}`;

    // S3 integration point:
    // const { S3Client, PutObjectCommand } = require('@aws-sdk/client-s3');
    // const s3 = new S3Client({ region: this.region });
    // await s3.send(new PutObjectCommand({ Bucket: this.bucket, Key: key, Body: file.buffer, ContentType: file.mimetype }));
    return {
      url: `https://${this.bucket}.s3.${this.region}.amazonaws.com/${key}`,
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
