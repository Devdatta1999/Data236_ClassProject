/**
 * Analytics Event Model
 * Tracks user interactions, page views, and listing clicks for analytics reporting
 */

const { mongoose } = require('../config/database');

const analyticsEventSchema = new mongoose.Schema({
  eventId: {
    type: String,
    required: true,
    unique: true,
    index: true
  },
  eventType: {
    type: String,
    enum: ['page_view', 'listing_click', 'listing_view', 'search', 'section_view', 'booking_click', 'filter_applied'],
    required: true,
    index: true
  },
  userId: {
    type: String,
    default: null,
    index: true
  },
  userType: {
    type: String,
    enum: ['traveler', 'host', 'admin', 'guest'],
    default: 'guest',
    index: true
  },
  listingId: {
    type: String,
    default: null,
    index: true
  },
  listingType: {
    type: String,
    enum: ['Flight', 'Hotel', 'Car', null],
    default: null,
    index: true
  },
  providerId: {
    type: String,
    default: null,
    index: true
  },
  pageName: {
    type: String,
    required: true,
    index: true
  },
  pageUrl: {
    type: String,
    default: null
  },
  sectionName: {
    type: String,
    default: null,
    index: true
  },
  metadata: {
    type: mongoose.Schema.Types.Mixed,
    default: {}
  },
  sessionId: {
    type: String,
    default: null,
    index: true
  },
  ipAddress: {
    type: String,
    default: null
  },
  userAgent: {
    type: String,
    default: null
  },
  city: {
    type: String,
    default: null,
    index: true
  },
  state: {
    type: String,
    default: null,
    index: true
  },
  timestamp: {
    type: Date,
    default: Date.now,
    index: true
  }
}, {
  timestamps: true
});

// Compound indexes for common queries
analyticsEventSchema.index({ providerId: 1, eventType: 1, timestamp: -1 });
analyticsEventSchema.index({ listingId: 1, eventType: 1, timestamp: -1 });
analyticsEventSchema.index({ userId: 1, timestamp: -1 });
analyticsEventSchema.index({ pageName: 1, timestamp: -1 });
analyticsEventSchema.index({ city: 1, state: 1, timestamp: -1 });
analyticsEventSchema.index({ eventType: 1, timestamp: -1 });

const AnalyticsEvent = mongoose.models.AnalyticsEvent || mongoose.model('AnalyticsEvent', analyticsEventSchema, 'analytics_events');

module.exports = AnalyticsEvent;

