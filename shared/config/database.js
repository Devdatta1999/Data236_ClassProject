/**
 * Database connection configurations
 * Fix #3: This is the SINGLE source of truth for mongoose instance
 * All other modules should require('mongoose') which returns the same singleton
 */

const mongoose = require('mongoose');
const { Pool } = require('pg');
const logger = require('../utils/logger');

// CRITICAL: Disable buffering IMMEDIATELY when this module loads
// This must be set before ANY models are loaded anywhere in the application
mongoose.set('bufferCommands', false);

// CRITICAL: mongoose is exported in module.exports below
// Don't export it here separately, as it will be overwritten

// MongoDB Atlas connection
const MONGODB_URI = process.env.MONGODB_URI || 'mongodb://localhost:27017/aerive';

let mongoConnection = null;

// CRITICAL: Set up connection event handlers ONCE at module load time
// This ensures we capture ALL disconnection events, even if connection was established before handlers were set up
mongoose.connection.on('disconnected', () => {
  logger.warn('MongoDB disconnected', { readyState: mongoose.connection.readyState });
  mongoConnection = null;
});

mongoose.connection.on('error', (err) => {
  logger.error('MongoDB connection error:', err);
});

mongoose.connection.on('reconnected', () => {
  logger.info('MongoDB reconnected', { readyState: mongoose.connection.readyState });
});

mongoose.connection.on('connecting', () => {
  logger.info('MongoDB connecting...');
});

mongoose.connection.on('connected', () => {
  logger.info('MongoDB connected', { readyState: mongoose.connection.readyState });
});

async function connectMongoDB() {
  try {
    // If already connected and ready, return immediately
    if (mongoose.connection.readyState === 1 && mongoose.connection.db) {
      try {
        await mongoose.connection.db.admin().ping();
        return mongoose.connection;
      } catch (pingError) {
        logger.warn('Existing connection ping failed, reconnecting...', pingError.message);
        // Connection exists but is unhealthy, disconnect and reconnect
        await mongoose.disconnect();
        mongoConnection = null;
      }
    }

    if (mongoConnection && mongoose.connection.readyState === 1) {
      return mongoConnection;
    }

    const options = {
      maxPoolSize: 10,
      minPoolSize: 2, // Keep minimum connections alive
      serverSelectionTimeoutMS: 30000, // Increased for Atlas connections
      socketTimeoutMS: 60000, // Increased socket timeout
      connectTimeoutMS: 30000, // Connection timeout
      retryWrites: true,
      w: 'majority',
      // Keep connections alive
      heartbeatFrequencyMS: 10000, // Send heartbeat every 10 seconds to keep connection alive
      retryReads: true,
    };

    // CRITICAL: Disable buffering BEFORE connecting
    // This must be set globally before any models are loaded
    mongoose.set('bufferCommands', false);

    // Connection event handlers are set up at module load time (see top of file)
    // This ensures we capture all events even if connection was established before handlers were set up

    // Connect and wait for connection to be truly ready
    // mongoose.connect() promise resolves even if connection fails later
    // So we must wait for 'connected' event AND verify with ping
    mongoConnection = await mongoose.connect(MONGODB_URI, options);
    
    // CRITICAL: Wait for the 'connected' event - this ensures connection actually succeeded
    // The mongoose.connect() promise can resolve even if connection fails (wrong URI, network issues, etc.)
    if (mongoose.connection.readyState !== 1) {
      await new Promise((resolve, reject) => {
        const timeout = setTimeout(() => reject(new Error('MongoDB connection timeout - check URI, network, IP allowlist, credentials')), 30000);
        
        // Listen for 'connected' event - this fires when connection is truly established
        mongoose.connection.once('connected', () => {
          clearTimeout(timeout);
          resolve();
        });
        
        // Listen for 'error' event - connection failed
        mongoose.connection.once('error', (err) => {
          clearTimeout(timeout);
          reject(new Error(`MongoDB connection failed: ${err.message}. Check URI, network, IP allowlist, credentials.`));
        });
      });
    }
    
    // DOUBLE CHECK: Verify readyState is actually 1 (connected)
    if (mongoose.connection.readyState !== 1) {
      throw new Error(`MongoDB connection not ready after connect() - readyState: ${mongoose.connection.readyState}`);
    }
    
    // Verify connection is ready with a ping operation
    // This catches cases where connection appears ready but is actually broken
    try {
      await mongoose.connection.db.admin().ping();
    } catch (pingError) {
      throw new Error(`MongoDB connection ping failed: ${pingError.message}. Connection not ready.`);
    }
    
    // Ensure db object is available
    if (!mongoose.connection.db) {
      throw new Error('MongoDB db object not available after connection');
    }
    
    // Final verification - readyState must still be 1
    if (mongoose.connection.readyState !== 1) {
      throw new Error(`MongoDB connection disconnected after ping - readyState: ${mongoose.connection.readyState}`);
    }
    
    logger.info('MongoDB Atlas connected and ready for queries', {
      readyState: mongoose.connection.readyState,
      dbName: mongoose.connection.db.databaseName
    });
    return mongoConnection;
  } catch (error) {
    logger.error('MongoDB connection error:', error);
    mongoConnection = null;
    throw error;
  }
}

/**
 * Wait for MongoDB to be ready for queries
 * This ensures the connection is not just established but actually ready
 */
async function waitForMongoDBReady(maxWaitMs = 10000) {
  // CRITICAL: Check if connection is already ready WITHOUT reconnecting
  // Issue #3: We were disconnecting/reconnecting on every request check
  if (mongoose.connection.readyState === 1 && mongoose.connection.db) {
    try {
      // Verify with ping - if this works, connection is ready
      await Promise.race([
        mongoose.connection.db.admin().ping(),
        new Promise((_, reject) => setTimeout(() => reject(new Error('Ping timeout')), 2000))
      ]);
      
      // Double-check readyState after ping
      if (mongoose.connection.readyState === 1 && mongoose.connection.db) {
        logger.debug('MongoDB is ready (already connected)');
        return true;
      }
    } catch (pingError) {
      logger.warn('MongoDB ping failed on existing connection:', pingError.message);
      // Connection exists but is broken, will reconnect below
    }
  }
  
  // Only reconnect if connection is truly broken
  // Issue #3: Don't disconnect/reconnect unnecessarily
  logger.info('MongoDB connection not ready, ensuring connection...', { 
    readyState: mongoose.connection.readyState,
    hasDb: !!mongoose.connection.db
  });
  
  try {
    // Only disconnect if we're in a bad state (disconnected or disconnecting)
    // Don't disconnect if we're in state 2 (connecting) - let it finish
    if (mongoose.connection.readyState === 0 || mongoose.connection.readyState === 3) {
      try {
        // Only disconnect if there's actually a connection to disconnect
        if (mongoConnection) {
          await mongoose.disconnect();
          logger.info('Disconnected stale MongoDB connection');
        }
        mongoConnection = null;
      } catch (disconnectError) {
        // Ignore - might already be disconnected
        logger.debug('Disconnect attempt (may already be disconnected):', disconnectError.message);
        mongoConnection = null;
      }
    }
    
    // Connect (will reuse existing connection if connecting/connected)
    await connectMongoDB();
    
    // Final verification - connection must be ready
    if (mongoose.connection.readyState !== 1 || !mongoose.connection.db) {
      throw new Error(`MongoDB connection not ready after connect (readyState: ${mongoose.connection.readyState})`);
    }
    
    // Final ping to ensure connection works
    await mongoose.connection.db.admin().ping();
    
    logger.info('MongoDB is ready for queries', {
      readyState: mongoose.connection.readyState,
      dbName: mongoose.connection.db.databaseName
    });
    return true;
  } catch (reconnectError) {
    logger.error('MongoDB connection failed:', reconnectError.message);
    throw new Error(`MongoDB connection failed: ${reconnectError.message}`);
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
  mongoose, // CRITICAL: Export mongoose so all modules use the same instance
  connectMongoDB,
  waitForMongoDBReady,
  getPostgresPool,
  testPostgresConnection
};

