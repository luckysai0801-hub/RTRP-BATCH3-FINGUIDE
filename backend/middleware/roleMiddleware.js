/**
 * middleware/roleMiddleware.js
 * Role-based access control.
 * Use AFTER protect middleware.
 */

const requireRole = (...roles) => (req, res, next) => {
    if (!req.user) {
        return res.status(401).json({ success: false, message: 'Not authenticated' });
    }
    if (!roles.includes(req.user.role)) {
        return res.status(403).json({
            success: false,
            message: `Access denied. Required role: ${roles.join(' or ')}`,
        });
    }
    next();
};

// Shorthand middleware for admin-only routes
const adminOnly = requireRole('admin');

module.exports = { requireRole, adminOnly };
