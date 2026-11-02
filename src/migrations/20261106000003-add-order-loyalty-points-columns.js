// Sprint 13 (#196): records how many loyalty points an order earned and redeemed, so a
// settled order's history is auditable without recomputing it from transactions.
module.exports = {
  async up(queryInterface, Sequelize) {
    const orders = await queryInterface.describeTable('orders');
    if (!orders.loyalty_points_earned) {
      await queryInterface.addColumn('orders', 'loyalty_points_earned', {
        type: Sequelize.INTEGER,
        allowNull: false,
        defaultValue: 0,
      });
    }
    if (!orders.loyalty_points_redeemed) {
      await queryInterface.addColumn('orders', 'loyalty_points_redeemed', {
        type: Sequelize.INTEGER,
        allowNull: false,
        defaultValue: 0,
      });
    }
  },

  async down(queryInterface) {
    const orders = await queryInterface.describeTable('orders');
    if (orders.loyalty_points_redeemed) {
      await queryInterface.removeColumn('orders', 'loyalty_points_redeemed');
    }
    if (orders.loyalty_points_earned) {
      await queryInterface.removeColumn('orders', 'loyalty_points_earned');
    }
  },
};
