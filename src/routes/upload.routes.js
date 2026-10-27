const { Router } = require('express');
const { auth } = require('../middleware/auth');
const { rbac } = require('../middleware/rbac');
const { MANAGER_ROLES } = require('../config/constants');
const { upload } = require('../middleware/upload');
const uploadController = require('../controllers/upload.controller');

const router = Router();

// Upload up to 5 images (max 5MB each, JPEG/PNG/WebP only)
// Product images are uploaded by shop managers only.
router.post(
  '/images',
  auth,
  rbac(MANAGER_ROLES),
  upload.array('images', 5),
  uploadController.uploadImages
);

module.exports = router;
