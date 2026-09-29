const mysql = require('mysql2/promise');
const { conReintentos } = require('./util');

async function conectarDB(nombre) {
  const pool = mysql.createPool({
    host: process.env.DB_HOST || 'mysql',
    port: Number(process.env.DB_PORT || 3306),
    user: process.env.DB_USER || 'pagos',
    password: process.env.DB_PASSWORD || 'pagos',
    database: process.env.DB_NAME || 'pagos_db',
    connectionLimit: 10,
    timezone: '-05:00',
    dateStrings: true,
    decimalNumbers: true,
  });
  // Verifica que la base de datos y las tablas ya existan antes de continuar.
  await conReintentos(`MySQL (${nombre})`, () => pool.query('SELECT 1 FROM pagos LIMIT 1'));
  return pool;
}

module.exports = { conectarDB };
