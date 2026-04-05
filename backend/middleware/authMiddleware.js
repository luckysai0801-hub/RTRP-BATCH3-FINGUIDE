/**
 * middleware/authMiddleware.js
 * Verifies JWT token in Authorization header.
 * Attaches decoded payload to req.user.
 */

const jwt = require('jsonwebtoken');

const protect = (req, res, next) => {
    let token;
    const authHeader = req.headers.authorization;

    if (authHeader && authHeader.startsWith('Bearer ')) {
        token = authHeader.split(' ')[1];
    } else if (req.cookies && req.cookies.fg_token) {
        token = req.cookies.fg_token;
    }

    if (!token) {
        return res.status(401).json({ success: false, message: 'Access denied. No token provided.' });
    }

    try {
        const decoded = jwt.verify(token, process.env.JWT_SECRET);
        req.user = decoded;  // { id, email, role }
        next();
    } catch (err) {
        if (err.name === 'TokenExpiredError') {
            return res.status(401).json({ success: false, message: 'Token expired. Please login again.' });
        }
        return res.status(401).json({ success: false, message: 'Invalid token.' });
    }
};

/**
 * Optional auth — attaches user if token present, but doesn't block request.
 * Useful for routes that show extra info when logged in.
 */
const optionalAuth = (req, res, next) => {
    const authHeader = req.headers.authorization;
    if (authHeader && authHeader.startsWith('Bearer ')) {
        try {
            req.user = jwt.verify(authHeader.split(' ')[1], process.env.JWT_SECRET);
        } catch (_) { /* ignore */ }
    }
    next();
};

module.exports = { protect, optionalAuth };
