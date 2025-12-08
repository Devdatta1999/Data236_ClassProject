/**
 * Script to create a traveler (user) via Kafka
 * Usage: MONGODB_URI="..." KAFKA_BROKERS="..." node create-traveler.js
 */

// Set required environment variables if not already set
if (!process.env.MONGODB_URI) {
  console.error('MONGODB_URI environment variable is required');
  process.exit(1);
}

const { connectMongoDB } = require('./shared/config/database');
const User = require('./services/user-service/models/User');
const logger = require('./shared/utils/logger');

async function createTraveler() {
  try {
    // Connect to MongoDB
    logger.info('Connecting to MongoDB...');
    await connectMongoDB();
    logger.info('Connected to MongoDB');

    // Generate traveler credentials
    const timestamp = Date.now();
    const userId = `${Math.floor(Math.random() * 900) + 100}-${Math.floor(Math.random() * 90) + 10}-${Math.floor(Math.random() * 9000) + 1000}`;
    const email = `traveler${timestamp}@aerive.com`;
    const password = 'traveler123456';

    // Check if user already exists
    const existing = await User.findOne({ $or: [{ userId }, { email }] });
    if (existing) {
      logger.warn(`User with email ${email} or userId ${userId} already exists`);
      console.log('User already exists!');
      console.log('User ID (SSN):', userId);
      console.log('Email:', email);
      console.log('Password:', password);
      process.exit(0);
    }

    // Create user (password will be hashed by pre-save hook)
    const user = new User({
      userId,
      firstName: 'John',
      lastName: 'Traveler',
      address: '123 Travel St',
      city: 'San Jose',
      state: 'CA',
      zipCode: '95112',
      phoneNumber: '1234567890',
      email,
      password, // Will be hashed by pre-save hook
    });

    await user.save();
    
    console.log('\n✅ Traveler created successfully!');
    console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
    console.log('User ID (SSN):', userId);
    console.log('Email:', email);
    console.log('Password:', password);
    console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n');

    // Test login
    logger.info('Testing password verification...');
    const testUser = await User.findOne({ email }).select('+password');
    const isMatch = await testUser.comparePassword(password);
    if (isMatch) {
      console.log('✅ Password verification successful!\n');
    } else {
      console.log('❌ Password verification failed!\n');
    }

    process.exit(0);
  } catch (error) {
    logger.error('Error creating traveler:', error);
    console.error('❌ Error creating traveler:', error.message);
    process.exit(1);
  }
}

createTraveler();

