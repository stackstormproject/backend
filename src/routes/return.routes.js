const express = require('express');
const returnController = require('../controllers/return.controller');
const { auth } = require('../middleware/auth');

const router = express.Router();

router.use(auth);

router.post('/', returnController.requestReturn);
router.get('/my-returns', returnController.getMyReturns);
router.get('/:id', returnController.getReturnById);

module.exports = router;
