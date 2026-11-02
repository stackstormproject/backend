const AppError = require('../utils/AppError');

const rbac = (allowedRoles) => (req, res, next) => {
  if (!req.user) {
    return next(new AppError(401, 'UNAUTHORIZED', 'Authentication required.'));
  }

  if (!allowedRoles.includes(req.user.role)) {
    return next(
      new AppError(403, 'FORBIDDEN', 'You do not have permission to perform this action.')
    );
  }

  return next();
};

module.exports = { rbac };
