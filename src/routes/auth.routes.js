const { Router } = require('express');
const { ADMIN_ROLES } = require('../config/constants');
const AuthService = require('../services/AuthService');
const asyncHandler = require('../utils/asyncHandler');
const validate = require('../middleware/validate');
const { auth } = require('../middleware/auth');
const { rbac } = require('../middleware/rbac');
const { registerRules, loginRules } = require('../validators/auth.validators');
const { getRefreshTtlMs } = require('../utils/tokenGenerator');
const { loginLimiter, registerLimiter } = require('../middleware/rateLimiter');

const REFRESH_COOKIE = 'refreshToken';
const cookieOptions = () => ({
  httpOnly: true,
  secure: process.env.NODE_ENV === 'production',
  sameSite: 'strict',
  path: '/api/auth',
  maxAge: getRefreshTtlMs(),
});
const router = Router();
router.post(
  '/register',
  registerLimiter,
  registerRules,
  validate,
  asyncHandler(async (req, res) => {
    const { customer, accessToken, refreshToken } = await AuthService.register(req.body);
    res.cookie(REFRESH_COOKIE, refreshToken, cookieOptions());
    res.status(201).json({ customer, accessToken });
  })
);
router.post(
  '/login',
  loginLimiter,
  loginRules,
  validate,
  asyncHandler(async (req, res) => {
    const { customer, accessToken, refreshToken } = await AuthService.loginCustomer(
      req.body.email,
      req.body.password
    );
    res.cookie(REFRESH_COOKIE, refreshToken, cookieOptions());
    res.json({ customer, accessToken });
  })
);
router.get('/me', auth, (req, res) => {
  res.json({ userId: req.user.userId, role: req.user.role });
});
router.post(
  '/admin/login',
  loginRules,
  validate,
  asyncHandler(async (req, res) => {
    const { admin, accessToken, refreshToken } = await AuthService.loginAdmin(
      req.body.email,
      req.body.password
    );
    res.cookie(REFRESH_COOKIE, refreshToken, cookieOptions());
    res.json({ admin, accessToken });
  })
);

router.get('/admin/me', auth, rbac(ADMIN_ROLES), (req, res) => {
  res.json({ userId: req.user.userId, role: req.user.role });
});
module.exports = { router, REFRESH_COOKIE, cookieOptions };
