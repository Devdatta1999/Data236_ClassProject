/**
 * Script to check if users are being saved to MongoDB Atlas
 */

// Load environment variables if .env exists
try {
  require('dotenv').config();
} catch (e) {
  // dotenv not available, use environment variables directly
}

const { mongoose, connectMongoDB } = require('./shared/config/database');
const User = require('./services/user-service/models/User');

async function checkUsers() {
  try {
    console.log('Connecting to MongoDB...');
    await connectMongoDB();
    console.log('Connected to MongoDB');
    
    const userCount = await User.countDocuments();
    console.log(`\nTotal users in database: ${userCount}`);
    
    if (userCount > 0) {
      const users = await User.find().limit(10).select('userId email firstName lastName createdAt');
      console.log('\nSample users:');
      users.forEach((user, index) => {
        console.log(`${index + 1}. ${user.userId} - ${user.email} - ${user.firstName} ${user.lastName} (Created: ${user.createdAt})`);
      });
    } else {
      console.log('\nNo users found in database.');
    }
    
    process.exit(0);
  } catch (error) {
    console.error('Error checking users:', error);
    process.exit(1);
  }
}

checkUsers();

