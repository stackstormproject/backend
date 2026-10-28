const ROLES = {
  CUSTOMER: 'customer',
  ADMIN: 'admin',
  SUPER_ADMIN: 'super_admin',
  SUPPORT_AGENT: 'support_agent',
};
// Everyone who may sign in to the admin app.
const ADMIN_ROLES = [ROLES.ADMIN, ROLES.SUPER_ADMIN, ROLES.SUPPORT_AGENT];
// Run the shop: catalogue, stock, orders, returns, loyalty, analytics.
const MANAGER_ROLES = [ROLES.ADMIN, ROLES.SUPER_ADMIN];
// Answer customers in the support console.
const SUPPORT_ROLES = [ROLES.ADMIN, ROLES.SUPER_ADMIN, ROLES.SUPPORT_AGENT];
const AUTH = {
  MAX_FAILED_LOGINS: 5,
  LOCK_MINUTES: 15,
  REFRESH_REUSE_GRACE_SECONDS: 10,
  RESET_TOKEN_MINUTES: 60,
};
module.exports = { ROLES, ADMIN_ROLES, MANAGER_ROLES, SUPPORT_ROLES, AUTH };
