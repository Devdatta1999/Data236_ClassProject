/**
 * Listing Routes
 */

const express = require('express');
const router = express.Router();
const flightController = require('../controllers/flightController');
const hotelController = require('../controllers/hotelController');
const carController = require('../controllers/carController');
const { authenticate, requireAdmin, requireProvider } = require('../../../shared/middleware/auth');

// Flight routes
// Note: Search is handled via Kafka (search-events topic)
router.get('/flights/by-provider', authenticate, flightController.getFlightsByProvider);
router.get('/flights/:flightId', flightController.getFlight);
router.post('/flights', authenticate, requireProvider, flightController.createFlight);
router.put('/flights/:flightId', authenticate, requireProvider, flightController.updateFlight);
router.delete('/flights/:flightId', authenticate, flightController.deleteFlight);
router.post('/flights/:flightId/reviews', authenticate, flightController.addReview);
router.get('/flights/:flightId/reviews', flightController.getReviews);

// Hotel routes
// Note: Search is handled via Kafka (search-events topic)
router.get('/hotels/by-provider', authenticate, hotelController.getHotelsByProvider);
router.get('/hotels/:hotelId', hotelController.getHotel);
router.post('/hotels', authenticate, requireProvider, hotelController.createHotel);
router.put('/hotels/:hotelId', authenticate, requireProvider, hotelController.updateHotel);
router.delete('/hotels/:hotelId', authenticate, hotelController.deleteHotel);
router.post('/hotels/:hotelId/reviews', authenticate, hotelController.addReview);
router.get('/hotels/:hotelId/reviews', hotelController.getReviews);

// Car routes
// Note: Search is handled via Kafka (search-events topic)
router.get('/cars/by-provider', authenticate, carController.getCarsByProvider);
router.get('/cars/:carId', carController.getCar);
router.post('/cars', authenticate, requireProvider, carController.createCar);
router.put('/cars/:carId', authenticate, requireProvider, carController.updateCar);
router.delete('/cars/:carId', authenticate, carController.deleteCar);
router.post('/cars/:carId/reviews', authenticate, carController.addReview);
router.get('/cars/:carId/reviews', carController.getReviews);

module.exports = router;

