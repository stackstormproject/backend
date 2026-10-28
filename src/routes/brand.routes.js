const { Router } = require('express');
const brandController = require('../controllers/brand.controller');

const router = Router();

// Refs #173: featured brands with products on sale, for the shop's "Our brands" section.
router.get('/', brandController.listPublic);

module.exports = router;
