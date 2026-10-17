const winston = require('winston');
const REDACT_FRAGMENTS = [
  'password',
  'token',
  'secret',
  'authorization',
  'cookie',
  'email',
  'phone',
  'card',
  'hash',
];
const PROTECTED_KEYS = ['level', 'message', 'timestamp'];
function redactValue(value, depth = 0) {
  if (value === null || typeof value !== 'object' || depth > 5) return value;
  if (Array.isArray(value)) return value.map((item) => redactValue(item, depth + 1));
  return Object.keys(value).reduce((safe, key) => {
    const sensitive = REDACT_FRAGMENTS.some((part) => key.toLowerCase().includes(part));
    return { ...safe, [key]: sensitive ? '[REDACTED]' : redactValue(value[key], depth + 1) };
  }, {});
}
const redact = winston.format((info) => {
  Object.keys(info).forEach((key) => {
    if (!PROTECTED_KEYS.includes(key)) {
      // eslint-disable-next-line no-param-reassign
      info[key] = redactValue(info[key]);
    }
  });
  return info;
});
const isProduction = process.env.NODE_ENV === 'production';
const logger = winston.createLogger({
  level: process.env.LOG_LEVEL || 'info',
  silent: process.env.NODE_ENV === 'test',
  format: winston.format.combine(
    redact(),
    winston.format.timestamp(),
    isProduction
      ? winston.format.json()
      : winston.format.combine(winston.format.colorize(), winston.format.simple())
  ),
  transports: [new winston.transports.Console()],
});
module.exports = logger;
module.exports.redactValue = redactValue;
