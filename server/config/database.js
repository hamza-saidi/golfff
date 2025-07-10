const mysql = require('mysql2');
require('dotenv').config();

// Configuration du pool de connexions
const pool = mysql.createPool({
  host: process.env.DB_HOST || 'localhost',
  user: process.env.DB_USER || 'root',
  password: process.env.DB_PASSWORD || '',
  database: process.env.DB_NAME || 'contact_crm',
  port: process.env.DB_PORT || 3306,
  waitForConnections: true,
  connectionLimit: 10,
  queueLimit: 0
});

// Promisify pour utiliser async/await
const promisePool = pool.promise();

// Test de connexion
const testConnection = async () => {
  try {
    const connection = await promisePool.getConnection();
    console.log('✅ Connexion MySQL établie avec succès');
    connection.release();
    return true;
  } catch (error) {
    console.error('❌ Erreur de connexion MySQL:', error.message);
    return false;
  }
};

// Fonction utilitaire pour exécuter des requêtes
const executeQuery = async (query, params = []) => {
  try {
    const [results] = await promisePool.execute(query, params);
    return results;
  } catch (error) {
    console.error('Erreur lors de l\'exécution de la requête:', error);
    throw error;
  }
};

// Fonction pour obtenir une connexion du pool
const getConnection = async () => {
  return await promisePool.getConnection();
};

module.exports = {
  pool,
  promisePool,
  testConnection,
  executeQuery,
  getConnection
};