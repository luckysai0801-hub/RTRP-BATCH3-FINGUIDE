/**
 * models/FixedDeposit.js
 * Sequelize model for Fixed Deposit schemes.
 * FK: bank_id → Banks.id (ON DELETE CASCADE)
 */

const { DataTypes } = require('sequelize');

module.exports = (sequelize) => {
    const FixedDeposit = sequelize.define('FixedDeposit', {
        id: {
            type: DataTypes.INTEGER,
            autoIncrement: true,
            primaryKey: true,
        },
        bank_id: {
            type: DataTypes.INTEGER,
            allowNull: false,
            references: { model: 'banks', key: 'id' },
            onDelete: 'CASCADE',
        },
        scheme_name: {
            type: DataTypes.STRING(150),
            defaultValue: 'Regular Fixed Deposit',
        },
        interest_rate: {
            type: DataTypes.DECIMAL(5, 2),
            allowNull: false,
            comment: 'Annual rate % for general public',
        },
        senior_citizen_rate: {
            type: DataTypes.DECIMAL(5, 2),
            allowNull: false,
            comment: 'Additional 0.25–0.5% for senior citizens',
        },
        min_tenure: {
            type: DataTypes.INTEGER,
            allowNull: false,
            comment: 'Minimum tenure in days',
        },
        max_tenure: {
            type: DataTypes.INTEGER,
            allowNull: false,
            comment: 'Maximum tenure in days',
        },
        min_amount: {
            type: DataTypes.INTEGER,
            defaultValue: 1000,
            comment: 'Minimum deposit in INR',
        },
        max_amount: {
            type: DataTypes.BIGINT,
            allowNull: true,
        },
        compounding_frequency: {
            type: DataTypes.ENUM('quarterly', 'monthly', 'annually', 'simple'),
            defaultValue: 'quarterly',
        },
        rating: {
            type: DataTypes.DECIMAL(3, 1),
            defaultValue: 4.0,
        },
        apply_url: {
            type: DataTypes.TEXT,
            allowNull: true,
        },
        premature_withdrawal: {
            type: DataTypes.BOOLEAN,
            defaultValue: true,
        },
        loan_against_fd: {
            type: DataTypes.BOOLEAN,
            defaultValue: true,
        },
        is_active: {
            type: DataTypes.BOOLEAN,
            defaultValue: true,
        },
        last_updated: {
            type: DataTypes.DATE,
            defaultValue: DataTypes.NOW,
        },
    }, {
        tableName: 'fixed_deposits',
        timestamps: true,
        underscored: true,
        indexes: [
            { fields: ['bank_id'] },
            { fields: ['interest_rate'] },
            { fields: ['min_tenure'] },
            { fields: ['is_active'] },
        ],
    });

    return FixedDeposit;
};
