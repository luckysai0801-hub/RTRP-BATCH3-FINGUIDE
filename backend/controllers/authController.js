/**
 * controllers/authController.js
 * Handles admin login safely without needing a User database table.
 * Validates credentials directly against .env variables.
 * JWT payload: { email, role, name }
 */

const jwt = require('jsonwebtoken');

const generateToken = (admin) => jwt.sign(
    { email: admin.email, role: admin.role, name: admin.name },
    process.env.JWT_SECRET,
    { expiresIn: process.env.JWT_EXPIRES_IN || '7d' }
);

// POST /api/auth/login
const login = async (req, res) => {
    try {
        const { email, password } = req.body;

        // Strict mapping to Admin Environment variables
        if (email === process.env.ADMIN_EMAIL && password === process.env.ADMIN_PASSWORD) {
            const admin = { name: 'Super Admin', email, role: 'admin' };
            const token = generateToken(admin);
            return res.json({ success: true, token, admin });
        }

        return res.status(401).json({ success: false, message: 'Invalid admin credentials' });
    } catch (err) {
        res.status(500).json({ success: false, message: err.message });
    }
};

module.exports = { login };
