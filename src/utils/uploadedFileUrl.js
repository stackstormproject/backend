const crypto = require('crypto');
const ApiError = require('./ApiError');
const { bucketName, region } = require('../config/s3');
const { mediaUrl } = require('../config/storage');

/**
 * Public link for a file multer just stored: the backend's media route for local disk, the
 * CDN or S3 location otherwise. Shared by product photos and profile pictures (#189).
 */
const uploadedFileUrl = (file) => {
  const cdnBase = process.env.CDN_URL || process.env.AWS_CLOUDFRONT_URL;
  // Saved on the backend's own disk (no S3 bucket configured)
  if (file.path && file.filename) return mediaUrl(`products/${file.filename}`);

  if (file.location) {
    if (cdnBase && file.key) return `${cdnBase.replace(/\/+$/, '')}/${file.key}`;
    return file.location;
  }

  // In non-test environments, a missing location means the S3 upload failed; never hide it.
  if (process.env.NODE_ENV !== 'test') {
    throw ApiError.internal(
      'File upload to storage failed: missing upload location from S3',
      undefined,
      'S3_UPLOAD_FAILED'
    );
  }

  const fileKey = file.key || `products/${crypto.randomUUID()}-${file.originalname}`;
  if (cdnBase) return `${cdnBase.replace(/\/+$/, '')}/${fileKey}`;
  return `https://${bucketName}.s3.${region}.amazonaws.com/${fileKey}`;
};

module.exports = { uploadedFileUrl };
