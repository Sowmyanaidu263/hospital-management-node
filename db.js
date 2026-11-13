const mysql = require('mysql2');
require('dotenv').config();

const db = mysql.createPool({
    host: process.env.MYSQLHOST || 'localhost',
    user: process.env.MYSQLUSER || 'root',
    password: process.env.MYSQLPASSWORD || '',
    database: process.env.MYSQLDATABASE || 'hospital_db2',
    port: process.env.MYSQLPORT || 3306,
    ssl: process.env.MYSQLHOST && process.env.MYSQLHOST !== 'localhost'
        ? { minVersion: 'TLSv1.2', rejectUnauthorized: true }
        : undefined,
    waitForConnections: true,
    connectionLimit: 5
});

db.getConnection((err, connection) => {
    if (err) {
        console.error('Database connection failed:', err);
        return;
    }
    console.log('Connected to MySQL database.');
    connection.release();
});

module.exports = db;