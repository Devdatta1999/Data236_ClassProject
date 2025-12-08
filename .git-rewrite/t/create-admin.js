/**
 * Script to create an admin user
 * Usage: MONGODB_URI="..." node create-admin.js
 */

// Set MONGODB_URI from environment if not already set
if (!process.env.MONGODB_URI) {
  console.error('MONGODB_URI environment variable is required');
  process.exit(1);
}

const { connectMongoDB } = require('./shared/config/database');
const Admin = require('./services/admin-service/models/Admin');
const logger = require('./shared/utils/logger');

async function createAdmin() {
  try {
    // Connect to MongoDB
    logger.info('Connecting to MongoDB...');
    await connectMongoDB();
    logger.info('Connected to MongoDB');

    // Generate admin credentials
    const timestamp = Date.now();
    const adminId = `ADMIN-${timestamp}`;
    const email = `admin${timestamp}@aerive.com`;
    const password = 'admin123456';

    // Check if admin already exists
    const existing = await Admin.findOne({ email });
    if (existing) {
      logger.warn(`Admin with email ${email} already exists`);
      console.log('Admin already exists!');
      console.log('Email:', email);
      console.log('Password:', password);
      process.exit(0);
    }

    // Create admin (password will be hashed by pre-save hook)
    const admin = new Admin({
      adminId,
      firstName: 'Admin',
      lastName: 'User',
      email,
      password, // Will be hashed by pre-save hook
      phoneNumber: '1234567890',
      accessLevel: 'admin',
      address: {
        street: '123 Admin St',
        city: 'San Jose',
        state: 'CA',
        zipCode: '95112'
      }
    });

    await admin.save();
    
    console.log('\n✅ Admin created successfully!');
    console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
    console.log('Admin ID:', adminId);
    console.log('Email:', email);
    console.log('Password:', password);
    console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n');

    // Test login
    logger.info('Testing login...');
    const testAdmin = await Admin.findOne({ email });
    const isMatch = await testAdmin.comparePassword(password);
    if (isMatch) {
      console.log('✅ Password verification successful!\n');
    } else {
      console.log('❌ Password verification failed!\n');
    }

    process.exit(0);
  } catch (error) {
    logger.error('Error creating admin:', error);
    console.error('❌ Error creating admin:', error.message);
    process.exit(1);
  }
}

createAdmin();

