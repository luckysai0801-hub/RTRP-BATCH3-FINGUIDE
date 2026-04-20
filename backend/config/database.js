/**
 * config/database.js
 * Sequelize connection — MySQL (local) via env vars.
 * Dialect changed from 'postgres' → 'mysql'.
 * All model definitions and associations remain unchanged.
 */

const { Sequelize } = require('sequelize');
const path = require('path');
require('dotenv').config({ path: path.resolve(__dirname, '../.env') });

let sequelize = null;

const {
    DB_DIALECT = 'mysql',
    DB_HOST    = 'localhost',
    DB_PORT    = '3306',
    DB_NAME    = 'finguide',
    DB_USER    = 'root',
    DB_PASS    = '',
} = process.env;

if (DB_NAME && DB_USER !== undefined) {
    sequelize = new Sequelize(DB_NAME, DB_USER, DB_PASS, {
        dialect:  DB_DIALECT,   // 'mysql'
        host:     DB_HOST,
        port:     parseInt(DB_PORT, 10),
        logging:  false,
        define: {
            timestamps:  true,
            underscored: true,   // snake_case columns
        },
        pool: {
            max:     5,
            min:     0,
            acquire: 30000,
            idle:    10000,
        },
    });
}

const connectDB = async () => {
    if (!sequelize) {
        console.warn('⚠️  DB config missing — running in mock-data mode');
        return false;
    }
    try {
        await sequelize.authenticate();
        console.log(`✅ MySQL connected → ${DB_HOST}:${DB_PORT}/${DB_NAME}`);
        return true;
    } catch (err) {
        console.error('❌ MySQL connection error:', err.message);
        console.warn('⚠️  Running in mock-data mode (no database)');
        return false;
    }
};

module.exports = { sequelize, connectDB };
