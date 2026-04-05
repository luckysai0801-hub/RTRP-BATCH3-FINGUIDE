const mysql = require('mysql2/promise');
require('dotenv').config();

async function initDB() {
    try {
        console.log('Connecting to MySQL server...');
        const connection = await mysql.createConnection({ 
            host: process.env.DB_HOST || 'localhost', 
            user: process.env.DB_USER || 'root', 
            password: process.env.DB_PASS || 'root' 
        });
        
        console.log('Creating database if not exists...');
        await connection.query('CREATE DATABASE IF NOT EXISTS `' + (process.env.DB_NAME || 'finguide') + '` CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;');
        
        console.log('✅ Database ' + (process.env.DB_NAME || 'finguide') + ' is ready!');
        await connection.end();
    } catch (err) {
        console.error('❌ Error creating database:', err.message);
        process.exit(1);
    }
}

initDB();
