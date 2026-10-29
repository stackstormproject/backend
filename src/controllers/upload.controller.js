const ApiError = require('../utils/ApiError');
const logger = require('../config/logger');
const { uploadedFileUrl } = require('../utils/uploadedFileUrl');

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

    const urls = req.files.map(uploadedFileUrl);

    logger.info(`[UPLOAD] Successfully uploaded ${urls.length} image(s)`);

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
