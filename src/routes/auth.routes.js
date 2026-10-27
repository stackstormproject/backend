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
  // '/api' so the cookie reaches both /api/auth and /api/v1/auth (the storefront uses v1)
  path: '/api',
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
router.post(
  '/refresh',
  asyncHandler(async (req, res) => {
    const result = await AuthService.refreshSession(req.cookies?.[REFRESH_COOKIE]);
    const { refreshToken, ...body } = result;
    res.cookie(REFRESH_COOKIE, refreshToken, cookieOptions());
    res.json(body);
  })
);
router.post(
  '/logout',
  asyncHandler(async (req, res) => {
    await AuthService.revokeSession(req.cookies?.[REFRESH_COOKIE]);
    const { httpOnly, secure, sameSite, path } = cookieOptions();
    res.clearCookie(REFRESH_COOKIE, { httpOnly, secure, sameSite, path });
    res.status(204).end();
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
