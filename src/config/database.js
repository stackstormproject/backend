require('dotenv').config({ quiet: true });

function getTestDatabaseUrl() {
  const testUrl = process.env.TEST_DATABASE_URL;
  if (testUrl) {
    const testDatabaseName = new URL(testUrl).pathname.replace(/^\/+/, '').toLowerCase();
    if (testDatabaseName !== 'testdb' && !testDatabaseName.endsWith('_test')) {
      throw new Error(
        'TEST_DATABASE_URL must target testdb or a database whose name ends in _test'
      );
    }
    return testUrl;
  }

  const databaseUrl = process.env.DATABASE_URL;
  if (!databaseUrl) {
    throw new Error(
      'Set TEST_DATABASE_URL or DATABASE_URL to a development database ending in _dev'
    );
  }

  const url = new URL(databaseUrl);
  const databaseName = url.pathname.replace(/^\/+/, '');
  const normalizedName = databaseName.toLowerCase();
  if (normalizedName === 'testdb' || normalizedName.endsWith('_test')) {
    return url.toString();
  }
  if (!normalizedName.endsWith('_dev')) {
    throw new Error('Set TEST_DATABASE_URL or use a DATABASE_URL database name ending in _dev');
  }

  url.pathname = `/${databaseName.slice(0, -4)}_test`;
  return url.toString();
}

module.exports = {
  development: {
    url: process.env.DATABASE_URL,
    dialect: 'postgres',
    // eslint-disable-next-line no-console -- Sequelize SQL logging is intentional in development.
    logging: console.log,
    dialectOptions: { ssl: false },
    pool: { max: 10, min: 0, acquire: 30000, idle: 10000 },
  },
  test: {
    get url() {
      return getTestDatabaseUrl();
    },
    dialect: 'postgres',
    logging: false,
  },
  production: {
    url: process.env.DATABASE_URL,
    dialect: 'postgres',
    logging: false,
    dialectOptions:
      process.env.DATABASE_SSL === 'false'
        ? { ssl: false }
        : { ssl: { require: true, rejectUnauthorized: false } },
    pool: { max: 20, min: 0, acquire: 30000, idle: 10000 },
  },
};
