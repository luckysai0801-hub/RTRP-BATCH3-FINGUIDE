/**
 * models/Loan.js
 * Sequelize model for loans (personal / home / car).
 * FK: bank_id → Banks.id (ON DELETE CASCADE)
 */

const { DataTypes } = require('sequelize');

module.exports = (sequelize) => {
    const Loan = sequelize.define('Loan', {
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
        loan_name: {
            type: DataTypes.STRING(150),
            allowNull: false,
        },
        loan_type: {
            type: DataTypes.ENUM('personal', 'home', 'car', 'education', 'business'),
            allowNull: false,
        },
        interest_rate: {
            type: DataTypes.DECIMAL(5, 2),
            allowNull: false,
            comment: '% per annum',
        },
        processing_fee: {
            type: DataTypes.DECIMAL(4, 2),
            defaultValue: 0,
            comment: '% of loan amount',
        },
        min_tenure: {
            type: DataTypes.INTEGER,
            allowNull: false,
            comment: 'Minimum tenure in months',
        },
        max_tenure: {
            type: DataTypes.INTEGER,
            allowNull: false,
            comment: 'Maximum tenure in months',
        },
        min_amount: {
            type: DataTypes.BIGINT,
            allowNull: true,
            comment: 'Minimum loan amount in INR',
        },
        max_amount: {
            type: DataTypes.BIGINT,
            allowNull: true,
            comment: 'Maximum loan amount in INR',
        },
        eligibility: {
            type: DataTypes.STRING(200),
            allowNull: true,
        },
        min_income: {
            type: DataTypes.INTEGER,
            allowNull: true,
        },
        features: {
            type: DataTypes.JSON,
            defaultValue: [],
        },
        rating: {
            type: DataTypes.DECIMAL(3, 1),
            defaultValue: 3.5,
        },
        apply_url: {
            type: DataTypes.TEXT,
            allowNull: true,
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
        tableName: 'loans',
        timestamps: true,
        underscored: true,
        indexes: [
            { fields: ['bank_id'] },
            { fields: ['loan_type'] },
            { fields: ['interest_rate'] },
            { fields: ['is_active'] },
        ],
    });

    return Loan;
};
