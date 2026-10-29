const { Router } = require('express');
const bannerController = require('../controllers/banner.controller');

const router = Router();

// Sprint 13: the shop's three home page hero banners.
router.get('/', bannerController.listPublic);

module.exports = router;
