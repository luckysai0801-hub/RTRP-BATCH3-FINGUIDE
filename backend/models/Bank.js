/**
 * models/Bank.js
 * Normalised Banks table — parent for CreditCards, Loans, FixedDeposits.
 * Satisfies 3NF: bank info stored once, referenced via FK.
 */

const { DataTypes } = require('sequelize');

module.exports = (sequelize) => {
    const Bank = sequelize.define('Bank', {
        id: {
            type: DataTypes.INTEGER,
            autoIncrement: true,
            primaryKey: true,
        },
        name: {
            type: DataTypes.STRING(100),
            allowNull: false,
            unique: { msg: 'Bank name must be unique' },
            validate: { notEmpty: true },
        },
        logo_url: {
            type: DataTypes.TEXT,
            allowNull: true,
        },
        bank_type: {
            type: DataTypes.ENUM('public', 'private', 'small_finance', 'nbfc', 'foreign'),
            allowNull: false,
            defaultValue: 'private',
        },
        established: {
            type: DataTypes.INTEGER,
            allowNull: true,
            comment: 'Year established',
        },
        headquarters: {
            type: DataTypes.STRING(100),
            allowNull: true,
        },
        website: {
            type: DataTypes.TEXT,
            allowNull: true,
        },
        is_active: {
            type: DataTypes.BOOLEAN,
            defaultValue: true,
        },
    }, {
        tableName: 'banks',
        timestamps: true,
        underscored: true,
        indexes: [{ fields: ['bank_type'] }, { fields: ['name'] }],
    });

    return Bank;
};
