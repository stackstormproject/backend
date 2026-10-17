require('dotenv').config({ quiet: true });

function getTestDatabaseUrl() {
  const configuredUrl = process.env.TEST_DATABASE_URL;
  if (configuredUrl) {
    const databaseName = new URL(configuredUrl).pathname.replace(/^\/+/, '');
    if (!databaseName.toLowerCase().endsWith('_test')) {
      throw new Error('TEST_DATABASE_URL must target a database whose name ends in _test');
    }
    return configuredUrl;
  }

  const developmentUrl = process.env.DATABASE_URL;
  if (!developmentUrl) {
    throw new Error(
      'Set TEST_DATABASE_URL or DATABASE_URL to a development database ending in _dev'
    );
  }

  const url = new URL(developmentUrl);
  const databaseName = url.pathname.replace(/^\/+/, '');
  if (!databaseName.toLowerCase().endsWith('_dev')) {
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
    dialectOptions: { ssl: { require: true, rejectUnauthorized: false } },
    pool: { max: 20, min: 0, acquire: 30000, idle: 10000 },
  },
};
