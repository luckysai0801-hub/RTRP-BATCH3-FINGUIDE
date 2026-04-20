/**
 * models/ScraperLog.js
 * Tracks every scraper run — section, records updated, status, errors.
 * Standalone table (no FK to banks).
 */

const { DataTypes } = require('sequelize');

module.exports = (sequelize) => {
    const ScraperLog = sequelize.define('ScraperLog', {
        id: {
            type: DataTypes.INTEGER,
            autoIncrement: true,
            primaryKey: true,
        },
        section: {
            type: DataTypes.ENUM('credit_cards', 'loans', 'fixed_deposits', 'all'),
            allowNull: false,
            comment: 'Which scraper ran',
        },
        records_updated: {
            type: DataTypes.INTEGER,
            defaultValue: 0,
            comment: 'Number of rows upserted',
        },
        status: {
            type: DataTypes.ENUM('success', 'partial', 'failed'),
            allowNull: false,
            defaultValue: 'success',
        },
        error_message: {
            type: DataTypes.TEXT,
            allowNull: true,
            comment: 'Populated on failure',
        },
        run_at: {
            type: DataTypes.DATE,
            defaultValue: DataTypes.NOW,
            comment: 'Timestamp when scraper ran',
        },
    }, {
        tableName: 'scraper_logs',
        timestamps: true,
        underscored: true,
    });

    return ScraperLog;
};
