const bcrypt = require('bcrypt');

function getWorkFactor() {
  const factor = parseInt(process.env.BCRYPT_WORK_FACTOR, 10);
  return Number.isNaN(factor) ? 12 : factor;
}
const hashPassword = (plaintext) => bcrypt.hash(plaintext, getWorkFactor());
const comparePassword = (plaintext, hash) => bcrypt.compare(plaintext, hash);
module.exports = { hashPassword, comparePassword };
