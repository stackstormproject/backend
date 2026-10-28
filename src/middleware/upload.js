const multer = require('multer');
const multerS3 = require('multer-s3');
const path = require('path');
const crypto = require('crypto');
const fs = require('fs');
const { s3Client, bucketName } = require('../config/s3');
const { UPLOAD_DIR, useLocalStorage } = require('../config/storage');
const ApiError = require('../utils/ApiError');

const ALLOWED_MIME_TYPES = ['image/jpeg', 'image/png', 'image/webp'];
const MAX_FILE_SIZE = 5 * 1024 * 1024; // 5MB
const EXTENSIONS = { 'image/jpeg': '.jpg', 'image/png': '.png', 'image/webp': '.webp' };

const fileFilter = (req, file, cb) => {
  if (file && ALLOWED_MIME_TYPES.includes(file.mimetype)) {
    cb(null, true);
  } else {
    cb(
      ApiError.badRequest(
        'Invalid file type. Only JPEG, PNG and WebP are allowed',
        undefined,
        'INVALID_FILE_TYPE'
      ),
      false
    );
  }
};

const getStorage = () => {
  // Use memory storage only in test mode (unless explicitly forced) or if explicitly requested
  if (
    (process.env.NODE_ENV === 'test' && !process.env.FORCE_S3_STORAGE) ||
    process.env.USE_MEMORY_STORAGE === 'true'
  ) {
    return multer.memoryStorage();
  }

  // Local disk (#172): files land in uploads/products and are served under /api/v1/media.
  // The name is random and the extension comes from the checked MIME type, never the upload.
  if (useLocalStorage()) {
    return multer.diskStorage({
      destination(req, file, cb) {
        const dir = path.join(UPLOAD_DIR, 'products');
        fs.mkdir(dir, { recursive: true }, (err) => cb(err, dir));
      },
      filename(req, file, cb) {
        cb(null, `${crypto.randomUUID()}${EXTENSIONS[file.mimetype]}`);
      },
    });
  }

  // Uses AWS S3 via multer-s3 (supports IAM roles via AWS SDK default credential provider chain and explicit keys)
  return multerS3({
    s3: s3Client,
    bucket: bucketName,
    contentType: multerS3.AUTO_CONTENT_TYPE,
    metadata(req, file, cb) {
      cb(null, { fieldName: file.fieldname });
    },
    key(req, file, cb) {
      const ext = path.extname(file.originalname) || `.${file.mimetype.split('/')[1]}`;
      const uniqueName = `products/${crypto.randomUUID()}${ext}`;
      cb(null, uniqueName);
    },
  });
};

const upload = multer({
  storage: getStorage(),
  limits: {
    fileSize: MAX_FILE_SIZE,
    files: 5,
  },
  fileFilter,
});

module.exports = {
  upload,
  fileFilter,
  getStorage,
  ALLOWED_MIME_TYPES,
  MAX_FILE_SIZE,
};
