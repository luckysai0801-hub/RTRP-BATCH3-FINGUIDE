// routes/auth.js
const router = require('express').Router();
const { body } = require('express-validator');
const { login } = require('../controllers/authController');
const { validate } = require('../middleware/validateInput');

const loginRules = [
    body('email').isEmail().withMessage('Valid email required'),
    body('password').notEmpty().withMessage('Password is required'),
];

router.post('/login', loginRules, validate, login);

module.exports = router;
