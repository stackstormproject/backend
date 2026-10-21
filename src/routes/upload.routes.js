const { Router } = require('express');
const { auth } = require('../middleware/auth');
const { upload } = require('../middleware/upload');
const uploadController = require('../controllers/upload.controller');

const router = Router();

// Upload up to 5 images (max 5MB each, JPEG/PNG/WebP only)
router.post('/images', auth, upload.array('images', 5), uploadController.uploadImages);

module.exports = router;
