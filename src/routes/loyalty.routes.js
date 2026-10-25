const express = require('express');
const loyaltyController = require('../controllers/loyalty.controller');
const { auth } = require('../middleware/auth');

const router = express.Router();

router.use(auth);

router.get('/', loyaltyController.getAccount);
router.get('/balance', loyaltyController.getAccount);
router.get('/transactions', loyaltyController.getTransactions);
router.post('/redeem', loyaltyController.redeemPoints);

module.exports = router;
