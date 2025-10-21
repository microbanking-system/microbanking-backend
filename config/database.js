// =============================================================================
// DATABASE CONFIGURATION - PostgreSQL Connection Pool
// =============================================================================
const { Pool } = require('pg');
require('dotenv').config();

const pool = new Pool({
  user: process.env.DB_USER,
  host: process.env.DB_HOST,
  database: process.env.DB_NAME,
  password: process.env.DB_PASSWORD,
  port: process.env.DB_PORT,
  ssl: {
    rejectUnauthorized: false,
  },
  // Add connection timeout and retry settings
  connectionTimeoutMillis: 10000, // 10 seconds
  idleTimeoutMillis: 30000, // 30 seconds
  max: 20, // Maximum number of clients in the pool
});

// Enhanced connection test with retry logic
const testConnection = async (retries = 3, delay = 5000) => {
  for (let i = 0; i < retries; i++) {
    try {
      const client = await pool.connect();
      console.log('✅ Connected to PostgreSQL database');
      client.release();
      return true;
    } catch (err) {
      console.error(`❌ Database connection attempt ${i + 1} failed:`, err.message);
      
      if (i < retries - 1) {
        console.log(`🔄 Retrying in ${delay/1000} seconds...`);
        await new Promise(resolve => setTimeout(resolve, delay));
      } else {
        console.error('💥 All connection attempts failed');
        // Don't exit process in production, let it try to reconnect
        if (process.env.NODE_ENV === 'development') {
          process.exit(1);
        }
        return false;
      }
    }
  }
};

// Test connection on startup
testConnection();

// Handle connection errors
pool.on('error', (err, client) => {
  console.error('💥 Unexpected error on idle client', err);
});

// Export the pool for use in controllers
module.exports = pool;