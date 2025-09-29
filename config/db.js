const mysql = require("mysql2/promise");

const db = mysql.createPool({
  host: process.env.DB_HOST || "localhost",
  user: process.env.DB_USER || "root",
  password: process.env.DB_PASS || "",
  database: process.env.DB_NAME || "jnemataram",
  waitForConnections: true,
  connectionLimit: 100,
  queueLimit: 0,
  timezone: "+08:00",
});

module.exports = db;
