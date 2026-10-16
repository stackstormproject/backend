require('dotenv').config({ quiet: true });

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
    url: process.env.DATABASE_URL,
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
