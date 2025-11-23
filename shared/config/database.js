/**
 * Database connection configurations
 */

const mongoose = require('mongoose');
const { Pool } = require('pg');
const logger = require('../utils/logger');

// MongoDB Atlas connection
const MONGODB_URI = process.env.MONGODB_URI || 'mongodb://localhost:27017/aerive';

let mongoConnection = null;

async function connectMongoDB() {
  try {
    if (mongoConnection) {
      return mongoConnection;
    }

    const options = {
      maxPoolSize: 10,
      serverSelectionTimeoutMS: 30000, // Increased for Atlas connections
      socketTimeoutMS: 45000,
      connectTimeoutMS: 30000, // Connection timeout
    };

    mongoConnection = await mongoose.connect(MONGODB_URI, options);
    logger.info('MongoDB Atlas connected successfully');
    return mongoConnection;
  } catch (error) {
    logger.error('MongoDB connection error:', error);
    throw error;
  }
}

// PostgreSQL connection pool (for billing)
// Supports both Supabase connection string and individual parameters
let pgPool = null;

function getPostgresPool() {
  if (!pgPool) {
    let pgConfig;
    
    // Check if Supabase connection string is provided
    if (process.env.SUPABASE_DB_URL || process.env.POSTGRES_URL || process.env.DATABASE_URL) {
      // Use connection string (Supabase format)
      const connectionString = process.env.SUPABASE_DB_URL || process.env.POSTGRES_URL || process.env.DATABASE_URL;
      pgConfig = {
        connectionString: connectionString,
        max: 20,
        idleTimeoutMillis: 30000,
        connectionTimeoutMillis: 2000,
        ssl: process.env.SUPABASE_SSL === 'true' || process.env.POSTGRES_SSL === 'true' ? { rejectUnauthorized: false } : false
      };
      logger.info('Using PostgreSQL connection string (Supabase)');
    } else {
      // Use individual connection parameters
      pgConfig = {
        host: process.env.POSTGRES_HOST || process.env.SUPABASE_DB_HOST || 'localhost',
        port: parseInt(process.env.POSTGRES_PORT || process.env.SUPABASE_DB_PORT || '5432'),
        database: process.env.POSTGRES_DB || process.env.SUPABASE_DB_NAME || 'aerive_billing',
        user: process.env.POSTGRES_USER || process.env.SUPABASE_DB_USER || 'postgres',
        password: process.env.POSTGRES_PASSWORD || process.env.SUPABASE_DB_PASSWORD || 'aerive123',
        max: 20,
        idleTimeoutMillis: 30000,
        connectionTimeoutMillis: 2000,
        ssl: process.env.SUPABASE_SSL === 'true' || process.env.POSTGRES_SSL === 'true' ? { rejectUnauthorized: false } : false
      };
      logger.info('Using PostgreSQL connection parameters');
    }
    
    pgPool = new Pool(pgConfig);
    
    pgPool.on('error', (err) => {
      logger.error('Unexpected PostgreSQL pool error:', err);
    });
    
    logger.info('PostgreSQL connection pool created');
  }
  return pgPool;
}

async function testPostgresConnection() {
  const pool = getPostgresPool();
  try {
    const client = await pool.connect();
    await client.query('SELECT NOW()');
    client.release();
    logger.info('PostgreSQL connection test successful');
  } catch (error) {
    logger.error('PostgreSQL connection test failed:', error);
    throw error;
  }
}

module.exports = {
  connectMongoDB,
  getPostgresPool,
  testPostgresConnection
};

