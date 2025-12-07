/**
 * Script to add Grand Hotel to listing service database
 * Run with: node add_grand_hotel.js
 */

const { mongoose } = require('./shared/config/database');
const Hotel = require('./services/listing-service/models/Hotel');

async function addGrandHotel() {
  try {
    // Connect to MongoDB
    await mongoose.connect(process.env.MONGODB_URI || 'mongodb://localhost:27017/aerive', {
      useNewUrlParser: true,
      useUnifiedTopology: true
    });

    console.log('Connected to MongoDB');

    // Check if hotel already exists
    const existing = await Hotel.findOne({ hotelId: 'HT001' });
    if (existing) {
      console.log('Grand Hotel (HT001) already exists');
      await mongoose.connection.close();
      return;
    }

    // Create Grand Hotel matching recommendation service data
    const grandHotel = new Hotel({
      hotelId: 'HT001',
      hotelName: 'Grand Hotel',
      providerId: 'PROV001',
      providerName: 'Grand Hotels Inc',
      address: '123 Main Street',
      city: 'Los Angeles',
      state: 'CA',
      zipCode: '90001',
      country: 'USA',
      starRating: 4,
      availableFrom: new Date('2024-01-01'),
      availableTo: new Date('2026-12-31'),
      totalRooms: 100,
      availableRooms: 50,
      roomTypes: [
        {
          type: 'Standard',
          pricePerNight: 150,
          availableCount: 30
        },
        {
          type: 'Suite',
          pricePerNight: 250,
          availableCount: 20
        }
      ],
      amenities: [
        'Free WiFi',
        'Breakfast Included',
        'Parking',
        'Pool',
        'Gym',
        'Near Transit',
        'Refundable'
      ],
      hotelRating: 4.2,
      reviews: [],
      images: [
        'https://example.com/hotel1.jpg',
        'https://example.com/hotel2.jpg'
      ],
      status: 'Active'
    });

    await grandHotel.save();
    console.log('✅ Grand Hotel (HT001) added successfully');

    // Verify
    const hotel = await Hotel.findOne({ hotelId: 'HT001' });
    console.log('Verified hotel:', {
      hotelId: hotel.hotelId,
      name: hotel.hotelName,
      city: hotel.city,
      starRating: hotel.starRating
    });

  } catch (error) {
    console.error('Error adding hotel:', error);
  } finally {
    await mongoose.connection.close();
    console.log('Database connection closed');
  }
}

addGrandHotel();
