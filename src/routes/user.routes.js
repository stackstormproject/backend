const express = require('express');
const userController = require('../controllers/user.controller');
const { auth } = require('../middleware/auth');
const { upload } = require('../middleware/upload');

const router = express.Router();

router.use(auth);

router.get('/me', userController.getProfile);
router.get('/profile', userController.getProfile);
router.put('/me', userController.updateProfile);
router.put('/profile', userController.updateProfile);
router.patch('/me', userController.updateProfile);
router.patch('/profile', userController.updateProfile);

// #189: profile picture (one JPEG/PNG/WebP up to 5 MB) and shopping preferences
router.post('/me/avatar', upload.single('avatar'), userController.uploadAvatar);
router.delete('/me/avatar', userController.deleteAvatar);
router.get('/me/preferences', userController.getPreferences);
router.put('/me/preferences', userController.updatePreferences);
router.patch('/me/preferences', userController.updatePreferences);

router.get('/addresses', userController.getAddresses);
router.post('/addresses', userController.addAddress);
router.put('/addresses/:id', userController.updateAddress);
router.patch('/addresses/:id/default', userController.setDefaultAddress);
router.delete('/addresses/:id', userController.deleteAddress);

module.exports = router;
