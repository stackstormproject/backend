const {
sequelize, Customer, Admin, Loyalty,
} = require('../../src/models');
const { hashPassword } = require('../../src/utils/passwordHash');
async function resetDatabase() {
if (/_dev$/.test(sequelize.config.database)) {
throw new Error('Refusing to truncate a development database');
}
await sequelize.query(
'TRUNCATE TABLE refresh_tokens, loyalties, customers, admins RESTART 
IDENTITY CASCADE'
);
}
async function createCustomer({ email = 'alice@example.com', password = 
'SecurePass@123' } = {}) {
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
async function createAdmin({ email = 'admin@example.com', password = 
'AdminPass@123', role = 'admin' } = {}) {
return Admin.create({
name: 'Test Admin',
email,
hashedPassword: await hashPassword(password),
role,
});
}
module.exports = {
resetDatabase, createCustomer, createAdmin, sequelize,
};