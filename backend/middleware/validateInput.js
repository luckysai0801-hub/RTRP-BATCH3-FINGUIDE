/**
 * middleware/validateInput.js
 * Input validation using express-validator.
 * Returns 422 with field-level errors on failure.
 */

const { validationResult } = require('express-validator');

/**
 * Runs after validation chains and returns errors if any.
 * Usage: router.post('/route', [...validators], validate, controller)
 */
const validate = (req, res, next) => {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
        return res.status(422).json({
            success: false,
            message: 'Validation failed',
            errors: errors.array().map(e => ({ field: e.path, message: e.msg })),
        });
    }
    next();
};

module.exports = { validate };
