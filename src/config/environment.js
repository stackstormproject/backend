const REQUIRED = ['NODE_ENV', 'DATABASE_URL', 'JWT_SECRET'];
function validateEnvironment(env = process.env) {
const missing = REQUIRED.filter((name) => !env[name]);
if (missing.length > 0) {
throw new Error(`Missing required environment variables: 
${missing.join(', ')}`);
}
if (env.JWT_SECRET.length < 32) {
throw new Error('JWT_SECRET must be at least 32 characters long');
}
if (env.REFRESH_TOKEN_EXPIRES_IN && 
!/^\d+d$/.test(env.REFRESH_TOKEN_EXPIRES_IN)) {
throw new Error('REFRESH_TOKEN_EXPIRES_IN must look like 7d');
}
const factor = parseInt(env.BCRYPT_WORK_FACTOR || '12', 10);
if (env.NODE_ENV === 'production' && factor < 12) {
throw new Error('BCRYPT_WORK_FACTOR must be at least 12 in production');
}
}
module.exports = { validateEnvironment };