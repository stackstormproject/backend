process.env.DATABASE_URL =
  process.env.DATABASE_URL || 'postgresql://test:test@localhost:5432/testdb';
const models = require('../../src/models');

describe('models', () => {
  afterAll(async () => {
    await models.sequelize.close();
  });

  it('should register 21 models given the model index loads', () => {
    const names = Object.keys(models).filter(
      (key) => !['sequelize', 'Sequelize'].includes(key)
    );
    expect(names).toHaveLength(21);
  });

  it('should soft delete customers given paranoid mode', () => {
    expect(models.Customer.options.paranoid).toBe(true);
  });

  it('should allow guest orders given a nullable customer id', () => {
    expect(models.Order.rawAttributes.customerId.allowNull).toBe(true);
  });

  it('should map the customer id to a single attribute on orders', () => {
    expect(models.Order.rawAttributes.customer_id).toBeUndefined();
    expect(models.Order.rawAttributes.customerId.field).toBe('customer_id');
  });

  it('should use the customer id as the primary key given a 1:1 loyalty account', () => {
    expect(models.Loyalty.primaryKeyAttributes).toEqual(['customerId']);
  });

  it('should not have a currency attribute on customers given LKR only', () => {
    expect(models.Customer.rawAttributes.currency).toBeUndefined();
  });
});
