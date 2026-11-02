const express = require('express');
const reviewController = require('../controllers/review.controller');
const { auth } = require('../middleware/auth');

const router = express.Router({ mergeParams: true });

router.post('/products/:productId', auth, reviewController.createReview);
router.get('/products/:productId', reviewController.getProductReviews);

router.post('/', auth, reviewController.createReview);
router.get('/my-reviews', auth, reviewController.getMyReviews);

module.exports = router;
