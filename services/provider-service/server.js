/**
 * Provider Service Server
 */

require('dotenv').config();
const express = require('express');
const cors = require('cors');
const { connectMongoDB } = require('../../shared/config/database');
const { getRedisClient } = require('../../shared/config/redis');
const { errorHandler } = require('../../shared/utils/errors');
const logger = require('../../shared/utils/logger');
const providerRoutes = require('./routes/providerRoutes');

const app = express();
const PORT = process.env.PORT || 3005;

app.use(cors());
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

app.get('/health', (req, res) => {
  res.json({ status: 'ok', service: 'provider-service' });
});

app.use('/api/providers', providerRoutes);

app.use(errorHandler);

async function startServer() {
  try {
    await connectMongoDB();
    await getRedisClient();
    
    app.listen(PORT, () => {
      logger.info(`Provider service running on port ${PORT}`);
    });
  } catch (error) {
    logger.error('Failed to start provider service:', error);
    process.exit(1);
  }
}

startServer();

process.on('SIGTERM', async () => {
  logger.info('SIGTERM received, shutting down gracefully');
  process.exit(0);
});

module.exports = app;

