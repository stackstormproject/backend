require('dotenv').config({ quiet: true });
process.env.NODE_ENV = 'test';
process.env.BCRYPT_WORK_FACTOR = '4';
process.env.DISABLE_RATE_LIMIT = process.env.DISABLE_RATE_LIMIT || 'true';
if (!process.env.JWT_SECRET) {
  process.env.JWT_SECRET = 'test_jwt_secret_that_is_long_enough';
}
if (!process.env.TEST_DATABASE_URL && !process.env.DATABASE_URL) {
  process.env.TEST_DATABASE_URL = 'postgresql://test:test@localhost:5432/testdb';
  process.env.DATABASE_URL = 'postgresql://test:test@localhost:5432/testdb';
}
