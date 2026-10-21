const {
  fileFilter,
  ALLOWED_MIME_TYPES,
  MAX_FILE_SIZE,
  upload,
} = require('../../../src/middleware/upload');
const ApiError = require('../../../src/utils/ApiError');

describe('upload middleware - fileFilter & configuration', () => {
  describe('ALLOWED_MIME_TYPES & limits', () => {
    it('should define allowed MIME types for JPEG, PNG, and WebP', () => {
      expect(ALLOWED_MIME_TYPES).toContain('image/jpeg');
      expect(ALLOWED_MIME_TYPES).toContain('image/png');
      expect(ALLOWED_MIME_TYPES).toContain('image/webp');
      expect(ALLOWED_MIME_TYPES).toHaveLength(3);
    });

    it('should define MAX_FILE_SIZE as 5MB', () => {
      expect(MAX_FILE_SIZE).toBe(5 * 1024 * 1024);
    });

    it('should configure multer instance with limits', () => {
      expect(upload).toBeDefined();
    });
  });

  describe('fileFilter', () => {
    it('should accept image/jpeg', (done) => {
      fileFilter({}, { mimetype: 'image/jpeg' }, (err, pass) => {
        expect(err).toBeNull();
        expect(pass).toBe(true);
        done();
      });
    });

    it('should accept image/png', (done) => {
      fileFilter({}, { mimetype: 'image/png' }, (err, pass) => {
        expect(err).toBeNull();
        expect(pass).toBe(true);
        done();
      });
    });

    it('should accept image/webp', (done) => {
      fileFilter({}, { mimetype: 'image/webp' }, (err, pass) => {
        expect(err).toBeNull();
        expect(pass).toBe(true);
        done();
      });
    });

    it('should reject text/plain with ApiError 400', (done) => {
      fileFilter({}, { mimetype: 'text/plain' }, (err, pass) => {
        expect(err).toBeInstanceOf(ApiError);
        expect(err.statusCode).toBe(400);
        expect(err.code).toBe('INVALID_FILE_TYPE');
        expect(err.message).toBe('Invalid file type. Only JPEG, PNG and WebP are allowed');
        expect(pass).toBe(false);
        done();
      });
    });

    it('should reject application/pdf with ApiError 400', (done) => {
      fileFilter({}, { mimetype: 'application/pdf' }, (err, pass) => {
        expect(err).toBeInstanceOf(ApiError);
        expect(err.statusCode).toBe(400);
        expect(pass).toBe(false);
        done();
      });
    });

    it('should reject text/javascript with ApiError 400', (done) => {
      fileFilter({}, { mimetype: 'text/javascript' }, (err, pass) => {
        expect(err).toBeInstanceOf(ApiError);
        expect(err.statusCode).toBe(400);
        expect(pass).toBe(false);
        done();
      });
    });

    it('should reject null or undefined file object safely', (done) => {
      fileFilter({}, null, (err, pass) => {
        expect(err).toBeInstanceOf(ApiError);
        expect(pass).toBe(false);
        done();
      });
    });
  });

  describe('getStorage', () => {
    const { getStorage } = require('../../../src/middleware/upload');

    it('should return memory storage in test mode by default', () => {
      const storage = getStorage();
      expect(storage).toBeDefined();
    });

    it('should configure multerS3 when FORCE_S3_STORAGE is enabled and creds provided', () => {
      const origEnv = { ...process.env };
      process.env.FORCE_S3_STORAGE = 'true';
      process.env.AWS_ACCESS_KEY_ID = 'test-key';
      process.env.AWS_SECRET_ACCESS_KEY = 'test-secret';

      const storage = getStorage();
      expect(storage).toBeDefined();

      storage.getMetadata({}, { fieldname: 'images' }, (err, meta) => {
        expect(err).toBeNull();
        expect(meta).toEqual({ fieldName: 'images' });
      });

      storage.getKey({}, { originalname: 'test.png', mimetype: 'image/png' }, (err, key) => {
        expect(err).toBeNull();
        expect(key).toMatch(/^products\/[a-f0-9-]+\.png$/);
      });

      storage.getKey({}, { originalname: 'test_no_ext', mimetype: 'image/webp' }, (err, key) => {
        expect(err).toBeNull();
        expect(key).toMatch(/^products\/[a-f0-9-]+\.webp$/);
      });

      process.env = origEnv;
    });
  });
});
