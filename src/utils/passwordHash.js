const bcrypt = require('bcrypt');

function hashPassword(password) {
  const workFactor = Number.parseInt(process.env.BCRYPT_WORK_FACTOR || '12', 10);
  return bcrypt.hash(password, workFactor);
}

function comparePassword(password, hash) {
  return bcrypt.compare(password, hash);
}

module.exports = { hashPassword, comparePassword };
