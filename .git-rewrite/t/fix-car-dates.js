/**
 * Script to fix cars without availableFrom/availableTo dates
 * Sets default date range: today to 1 year from today
 */

// Load environment variables if .env exists
try {
  require('dotenv').config();
} catch (e) {
  // dotenv not available, use environment variables directly
}

const { mongoose, connectMongoDB } = require('./shared/config/database');
const Car = require('./services/listing-service/models/Car');

async function fixCarDates() {
  try {
    console.log('Connecting to MongoDB...');
    await connectMongoDB();
    console.log('Connected to MongoDB');
    
    // Find cars without availableFrom or availableTo
    const carsWithoutDates = await Car.find({
      $or: [
        { availableFrom: null },
        { availableFrom: { $exists: false } },
        { availableTo: null },
        { availableTo: { $exists: false } }
      ]
    });
    
    console.log(`\nFound ${carsWithoutDates.length} cars without date ranges`);
    
    if (carsWithoutDates.length > 0) {
      const today = new Date();
      today.setHours(0, 0, 0, 0);
      const oneYearFromNow = new Date(today);
      oneYearFromNow.setFullYear(oneYearFromNow.getFullYear() + 1);
      
      for (const car of carsWithoutDates) {
        console.log(`Updating ${car.carId} (${car.model})...`);
        car.availableFrom = car.availableFrom || today;
        car.availableTo = car.availableTo || oneYearFromNow;
        await car.save();
        console.log(`  - Set availableFrom: ${car.availableFrom.toISOString().split('T')[0]}`);
        console.log(`  - Set availableTo: ${car.availableTo.toISOString().split('T')[0]}`);
      }
      
      console.log(`\n✅ Updated ${carsWithoutDates.length} cars with default date ranges`);
    } else {
      console.log('\n✅ All cars have date ranges set');
    }
    
    // Show all cars with their date ranges
    const allCars = await Car.find({ status: 'Active' }).select('carId model availableFrom availableTo');
    console.log('\nAll active cars with date ranges:');
    allCars.forEach(car => {
      console.log(`- ${car.carId} - ${car.model}`);
      console.log(`  From: ${car.availableFrom ? car.availableFrom.toISOString().split('T')[0] : 'NOT SET'}`);
      console.log(`  To: ${car.availableTo ? car.availableTo.toISOString().split('T')[0] : 'NOT SET'}`);
    });
    
    process.exit(0);
  } catch (error) {
    console.error('Error fixing car dates:', error);
    process.exit(1);
  }
}

fixCarDates();


