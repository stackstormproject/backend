// Where uploaded product images are kept (#172).
// STORAGE_DRIVER=s3 or =local chooses. Without it, S3 is used only when real AWS keys are set
// (the .env.example placeholder "xxx" does not count); otherwise images go to the backend's own
// disk, served under /api/v1/media, so a fresh machine can upload without an AWS account.
const path = require('path');

const MEDIA_ROUTE = '/api/v1/media';
// Resolved against this file's own location, not process.cwd(): `npm run dev` from the
// backend folder and a tool/IDE that launches node from somewhere else both land on the
// same uploads/ folder, so files saved before a restart are never "lost" just because the
// process started from a different working directory. An explicit UPLOAD_DIR still wins,
// and is resolved the normal way (against cwd if relative).
const UPLOAD_DIR = process.env.UPLOAD_DIR
  ? path.resolve(process.env.UPLOAD_DIR)
  : path.resolve(__dirname, '../../uploads');

const useLocalStorage = () => {
  if (process.env.STORAGE_DRIVER) return process.env.STORAGE_DRIVER === 'local';
  const key = process.env.AWS_ACCESS_KEY_ID;
  return !key || key === 'xxx';
};

/** Public URL of a file saved on local disk, e.g. /api/v1/media/products/abc.jpg */
const mediaUrl = (relativePath) => `${MEDIA_ROUTE}/${relativePath.split(path.sep).join('/')}`;

module.exports = { MEDIA_ROUTE, UPLOAD_DIR, useLocalStorage, mediaUrl };
