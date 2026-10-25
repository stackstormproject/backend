const express = require('express');
const userController = require('../controllers/user.controller');
const { auth } = require('../middleware/auth');

const router = express.Router();

router.use(auth);

router.get('/me', userController.getProfile);
router.get('/profile', userController.getProfile);
router.put('/me', userController.updateProfile);
router.put('/profile', userController.updateProfile);
router.patch('/me', userController.updateProfile);
router.patch('/profile', userController.updateProfile);

router.get('/addresses', userController.getAddresses);
router.post('/addresses', userController.addAddress);
router.put('/addresses/:id', userController.updateAddress);
router.patch('/addresses/:id/default', userController.setDefaultAddress);
router.delete('/addresses/:id', userController.deleteAddress);

module.exports = router;
