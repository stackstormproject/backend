const { body } = require('express-validator');

const email = body('email')
  .trim()
  .isEmail()
  .withMessage('A valid email is required')
  .bail()
  .isLength({ max: 255 })
  .toLowerCase();
const newPassword = (field) =>
  body(field)
    .isString()
    .isLength({ min: 8, max: 72 })
    .withMessage('Password must be 8-72 characters')
    .matches(/[a-z]/)
    .withMessage('Password needs a lowercase letter')
    .matches(/[A-Z]/)
    .withMessage('Password needs an uppercase letter')
    .matches(/\d/)
    .withMessage('Password needs a digit');
const registerRules = [
  body('name').trim().isLength({ min: 2, max: 100 }).withMessage('Name must be 2-100 characters'),
  email,
  newPassword('password'),
  body('phone')
    .optional({ nullable: true })
    .trim()
    .matches(/^\+?[0-9 ]{9,15}$/)
    .withMessage('Phone number is not valid'),
];
const loginRules = [
  email,
  body('password').isString().notEmpty().withMessage('Password is required'),
];
// #185 password reset
const forgotPasswordRules = [email];
const resetPasswordRules = [
  body('token')
    .isString()
    .matches(/^[a-f0-9]{64}$/)
    .withMessage('This reset link is not valid. Ask for a new one.'),
  newPassword('password'),
];
module.exports = {
  registerRules,
  loginRules,
  forgotPasswordRules,
  resetPasswordRules,
  emailRule: email,
};
