const { sequelize, Customer, Admin, Loyalty } = require('../../src/models');
const { hashPassword } = require('../../src/utils/passwordHash');

async function resetDatabase() {
  const databaseName = (sequelize.config.database || '').toLowerCase();
  if (databaseName !== 'testdb' && !databaseName.endsWith('_test')) {
    throw new Error('Refusing to truncate a database not explicitly named for testing');
  }
  await sequelize.query(
    'TRUNCATE TABLE refresh_tokens, loyalties, customers, admins RESTART IDENTITY CASCADE'
  );
}

async function createCustomer({ email = 'alice@example.com', password = 'SecurePass@123' } = {}) {
  const customer = await Customer.create({
    name: 'Alice Silva',
    email,
    hashedPassword: await hashPassword(password),
    registrationDate: new Date(),
  });
  await Loyalty.create({
    customerId: customer.id,
    currentPoints: 0,
    lifetimePoints: 0,
    tier: 'silver',
    tierStartDate: new Date(),
  });
  return customer;
}

async function createAdmin({
  email = 'admin@example.com',
  password = 'AdminPass@123',
  role = 'admin',
} = {}) {
  return Admin.create({
    name: 'Test Admin',
    email,
    hashedPassword: await hashPassword(password),
    role,
  });
}

module.exports = {
  resetDatabase,
  createCustomer,
  createAdmin,
  sequelize,
};
