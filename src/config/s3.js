const { S3Client } = require('@aws-sdk/client-s3');
const logger = require('./logger');

const region = process.env.AWS_REGION || 'ap-south-1';
const bucketName = process.env.AWS_S3_BUCKET || 'stackstorm-uploads';

const s3Config = {
  region,
};

if (process.env.AWS_ACCESS_KEY_ID && process.env.AWS_SECRET_ACCESS_KEY) {
  s3Config.credentials = {
    accessKeyId: process.env.AWS_ACCESS_KEY_ID,
    secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY,
  };
}

if (process.env.AWS_ENDPOINT) {
  s3Config.endpoint = process.env.AWS_ENDPOINT;
  s3Config.forcePathStyle = true;
}

const s3Client = new S3Client(s3Config);

logger.info(`[S3] Initialized AWS S3 client targeting region: ${region}, bucket: ${bucketName}`);

module.exports = {
  s3Client,
  bucketName,
  region,
};
