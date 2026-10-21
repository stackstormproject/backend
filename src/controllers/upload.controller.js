const crypto = require('crypto');
const ApiError = require('../utils/ApiError');
const { bucketName, region } = require('../config/s3');
const logger = require('../config/logger');

/**
 * Controller to handle batch image uploads to S3 / Object Storage
 *
 * @param {import('express').Request} req
 * @param {import('express').Response} res
 * @param {import('express').NextFunction} next
 */
const uploadImages = async (req, res, next) => {
  try {
    if (!req.files || req.files.length === 0) {
      throw ApiError.badRequest(
        'No files uploaded. Please attach at least one image file.',
        undefined,
        'NO_FILES_UPLOADED'
      );
    }

    const cdnBase = process.env.CDN_URL || process.env.AWS_CLOUDFRONT_URL;

    const urls = req.files.map((file) => {
      if (file.location) {
        if (cdnBase && file.key) {
          return `${cdnBase.replace(/\/+$/, '')}/${file.key}`;
        }
        return file.location;
      }

      const fileKey = file.key || `products/${crypto.randomUUID()}-${file.originalname}`;
      if (cdnBase) {
        return `${cdnBase.replace(/\/+$/, '')}/${fileKey}`;
      }
      return `https://${bucketName}.s3.${region}.amazonaws.com/${fileKey}`;
    });

    logger.info(`[UPLOAD] Successfully uploaded ${urls.length} image(s) to cloud storage`);

    return res.status(201).json({
      success: true,
      data: { urls },
      message: `${urls.length} image(s) uploaded successfully`,
      errors: [],
    });
  } catch (err) {
    return next(err);
  }
};

module.exports = {
  uploadImages,
};
