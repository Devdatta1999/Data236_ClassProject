/**
 * Redis client configuration
 */

const redis = require('redis');
const logger = require('../utils/logger');

const REDIS_HOST = process.env.REDIS_HOST || 'localhost';
const REDIS_PORT = process.env.REDIS_PORT || 6379;
const REDIS_PASSWORD = process.env.REDIS_PASSWORD || null;

let redisClient = null;

async function getRedisClient() {
  if (redisClient && redisClient.isOpen) {
    return redisClient;
  }

  try {
    const client = redis.createClient({
      socket: {
        host: REDIS_HOST,
        port: REDIS_PORT,
      },
      password: REDIS_PASSWORD,
    });

    client.on('error', (err) => {
      logger.error('Redis Client Error:', err);
    });

    client.on('connect', () => {
      logger.info('Redis client connected');
    });

    await client.connect();
    redisClient = client;
    return redisClient;
  } catch (error) {
    logger.error('Redis connection error:', error);
    throw error;
  }
}

/**
 * Cache helper functions
 */
async function getCache(key) {
  try {
    const client = await getRedisClient();
    const data = await client.get(key);
    return data ? JSON.parse(data) : null;
  } catch (error) {
    logger.error('Redis get error:', error);
    return null;
  }
}

async function setCache(key, value, ttl = 3600) {
  try {
    const client = await getRedisClient();
    await client.setEx(key, ttl, JSON.stringify(value));
  } catch (error) {
    logger.error('Redis set error:', error);
  }
}

async function deleteCache(key) {
  try {
    const client = await getRedisClient();
    await client.del(key);
  } catch (error) {
    logger.error('Redis delete error:', error);
  }
}

async function deleteCachePattern(pattern) {
  try {
    const client = await getRedisClient();
    const keys = await client.keys(pattern);
    if (keys.length > 0) {
      await client.del(keys);
    }
  } catch (error) {
    logger.error('Redis delete pattern error:', error);
  }
}

module.exports = {
  getRedisClient,
  getCache,
  setCache,
  deleteCache,
  deleteCachePattern
};

