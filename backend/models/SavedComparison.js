/**
 * models/SavedComparison.js
 * Stores a user's saved product comparison.
 * FK: user_id → Users.id (ON DELETE CASCADE)
 */

const { DataTypes } = require('sequelize');

module.exports = (sequelize) => {
    const SavedComparison = sequelize.define('SavedComparison', {
        id: {
            type: DataTypes.INTEGER,
            autoIncrement: true,
            primaryKey: true,
        },
        user_id: {
            type: DataTypes.INTEGER,
            allowNull: false,
            references: { model: 'users', key: 'id' },
            onDelete: 'CASCADE',
        },
        product_type: {
            type: DataTypes.ENUM('credit_card', 'loan', 'fixed_deposit'),
            allowNull: false,
        },
        product_ids: {
            type: DataTypes.JSON,
            allowNull: false,
            validate: {
                arrayLen(value) {
                    if (value.length < 2 || value.length > 3) {
                        throw new Error('You must compare 2 or 3 products');
                    }
                },
            },
        },
        label: {
            type: DataTypes.STRING(200),
            allowNull: true,
            comment: 'User-defined label for this comparison',
        },
        notes: {
            type: DataTypes.TEXT,
            allowNull: true,
        },
    }, {
        tableName: 'saved_comparisons',
        timestamps: true,
        underscored: true,
        indexes: [
            { fields: ['user_id'] },
            { fields: ['product_type'] },
        ],
    });

    return SavedComparison;
};
