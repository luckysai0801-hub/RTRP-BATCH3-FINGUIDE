/**
 * models/User.js
 * Sequelize model for registered users.
 * Supports role-based access: 'user' | 'admin'
 */

const { DataTypes } = require('sequelize');
const bcrypt = require('bcryptjs');

module.exports = (sequelize) => {
    const User = sequelize.define('User', {
        id: {
            type: DataTypes.INTEGER,
            autoIncrement: true,
            primaryKey: true,
        },
        name: {
            type: DataTypes.STRING(100),
            allowNull: false,
            validate: { len: [2, 100] },
        },
        email: {
            type: DataTypes.STRING(150),
            allowNull: false,
            unique: { msg: 'Email is already registered' },
            validate: { isEmail: { msg: 'Must be a valid email address' } },
        },
        password_hash: {
            type: DataTypes.TEXT,
            allowNull: false,
        },
        role: {
            type: DataTypes.ENUM('user', 'admin'),
            defaultValue: 'user',
            allowNull: false,
        },
        monthly_salary: {
            type: DataTypes.INTEGER,
            allowNull: true,
            comment: 'Used for recommendation engine',
        },
        spending_profile: {
            type: DataTypes.ENUM('travel', 'shopping', 'dining', 'fuel', 'general'),
            allowNull: true,
            comment: 'Primary spending category for card recommendation',
        },
        risk_appetite: {
            type: DataTypes.ENUM('low', 'medium', 'high'),
            defaultValue: 'medium',
            allowNull: true,
        },
    }, {
        tableName: 'users',
        timestamps: true,
        underscored: true,
        indexes: [{ fields: ['email'] }],
        // Never return password_hash in JSON responses
        defaultScope: {
            attributes: { exclude: ['password_hash'] },
        },
        scopes: {
            withPassword: { attributes: {} },
        },
    });

    /**
     * Hash plain-text password and store in password_hash
     * Call User.setPassword(plainText) before creating/updating
     */
    User.prototype.setPassword = async function (plainText) {
        this.password_hash = await bcrypt.hash(plainText, 12);
    };

    /**
     * Compare a plain-text password against the stored hash
     */
    User.prototype.comparePassword = async function (plainText) {
        return bcrypt.compare(plainText, this.password_hash);
    };

    return User;
};
