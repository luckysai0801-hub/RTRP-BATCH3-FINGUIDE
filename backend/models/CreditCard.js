

const { DataTypes } = require('sequelize');

module.exports = (sequelize) => {
    const CreditCard = sequelize.define('CreditCard', {
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
        card_name: {
            type: DataTypes.STRING(150),
            allowNull: false,
            validate: { notEmpty: true },
        },
        annual_fee: {
            type: DataTypes.INTEGER,
            defaultValue: 0,
            allowNull: false,
        },
        joining_fee: {
            type: DataTypes.INTEGER,
            defaultValue: 0,
        },
        interest_rate: {
            type: DataTypes.DECIMAL(5, 2),
            allowNull: false,
            comment: '% per annum',
        },
        cashback: {
            type: DataTypes.DECIMAL(4, 2),
            defaultValue: 0,
            comment: 'Default cashback %',
        },
        rewards_type: {
            type: DataTypes.ENUM('cashback', 'travel', 'shopping', 'fuel', 'dining', 'general'),
            allowNull: false,
            defaultValue: 'general',
        },
        rewards_description: {
            type: DataTypes.TEXT,
            allowNull: true,
        },
        eligibility: {
            type: DataTypes.STRING(200),
            allowNull: true,
        },
        min_income: {
            type: DataTypes.INTEGER,
            allowNull: true,
            comment: 'Minimum monthly income in INR',
        },
        rating: {
            type: DataTypes.DECIMAL(3, 1),
            defaultValue: 3.5,
            validate: { min: 0, max: 5 },
        },
        features: {
            type: DataTypes.JSON,
            defaultValue: [],
            comment: 'List of key features',
        },
        apply_url: {
            type: DataTypes.TEXT,
            allowNull: true,
        },
        image_url: {
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
        network: {
            type: DataTypes.ENUM('Visa', 'Mastercard', 'Rupay', 'Amex', 'Diners'),
            allowNull: true,
        },
        lounge_access: {
            type: DataTypes.BOOLEAN,
            defaultValue: false,
        },
        fuel_surcharge_waiver: {
            type: DataTypes.BOOLEAN,
            defaultValue: false,
        },
    }, {
        tableName: 'credit_cards',
        timestamps: true,
        underscored: true,
        indexes: [
            { fields: ['bank_id'] },
            { fields: ['rewards_type'] },
            { fields: ['annual_fee'] },
            { fields: ['rating'] },
            { fields: ['is_active'] },
        ],
    });

    return CreditCard;
};
