/**
 * Analytics Tracking Utility
 * Tracks user interactions, page views, and listing clicks for analytics
 */

import api from '../services/apiService';

// Generate a session ID on page load (stored in sessionStorage)
const getSessionId = () => {
  let sessionId = sessionStorage.getItem('analyticsSessionId');
  if (!sessionId) {
    sessionId = `SESSION-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
    sessionStorage.setItem('analyticsSessionId', sessionId);
  }
  return sessionId;
};

// Get user info from localStorage (if authenticated)
const getUserInfo = () => {
  try {
    const user = JSON.parse(localStorage.getItem('user') || 'null');
    const userType = localStorage.getItem('userType');
    return {
      userId: user?.userId || null,
      userType: userType || 'guest',
      city: user?.city || null,
      state: user?.state || null,
      providerId: user?.providerId || null // Include providerId for host analytics
    };
  } catch (error) {
    return {
      userId: null,
      userType: 'guest',
      city: null,
      state: null,
      providerId: null
    };
  }
};

/**
 * Track a page view
 * @param {string} pageName - Name of the page (e.g., '/dashboard', '/search')
 * @param {string} pageUrl - Full URL of the page
 * @param {object} metadata - Additional metadata
 */
export const trackPageView = async (pageName, pageUrl = null, metadata = {}) => {
  try {
    const userInfo = getUserInfo();
    
    // Extract providerId from metadata if provided, or from user info
    const providerId = metadata.providerId || userInfo.providerId || null;
    
    await api.post('/api/analytics/track', {
      eventType: 'page_view',
      userId: userInfo.userId,
      userType: userInfo.userType,
      providerId, // Include providerId for host analytics
      pageName,
      pageUrl: pageUrl || window.location.href,
      sessionId: getSessionId(),
      city: userInfo.city,
      state: userInfo.state,
      metadata
    });
  } catch (error) {
    // Silently fail - don't interrupt user experience
    console.warn('Failed to track page view:', error);
  }
};

/**
 * Track a listing click
 * @param {string} listingId - ID of the listing
 * @param {string} listingType - Type of listing (Flight, Hotel, Car)
 * @param {string} providerId - ID of the provider
 * @param {object} metadata - Additional metadata
 */
export const trackListingClick = async (listingId, listingType, providerId = null, metadata = {}) => {
  try {
    const userInfo = getUserInfo();
    
    await api.post('/api/analytics/track', {
      eventType: 'listing_click',
      userId: userInfo.userId,
      userType: userInfo.userType,
      listingId,
      listingType,
      providerId,
      pageName: window.location.pathname,
      pageUrl: window.location.href,
      sessionId: getSessionId(),
      city: userInfo.city,
      state: userInfo.state,
      metadata
    });
  } catch (error) {
    console.warn('Failed to track listing click:', error);
  }
};

/**
 * Track a listing view (when user views details)
 * @param {string} listingId - ID of the listing
 * @param {string} listingType - Type of listing (Flight, Hotel, Car)
 * @param {string} providerId - ID of the provider
 * @param {object} metadata - Additional metadata
 */
export const trackListingView = async (listingId, listingType, providerId = null, metadata = {}) => {
  try {
    const userInfo = getUserInfo();
    
    await api.post('/api/analytics/track', {
      eventType: 'listing_view',
      userId: userInfo.userId,
      userType: userInfo.userType,
      listingId,
      listingType,
      providerId,
      pageName: window.location.pathname,
      pageUrl: window.location.href,
      sessionId: getSessionId(),
      city: userInfo.city,
      state: userInfo.state,
      metadata
    });
  } catch (error) {
    console.warn('Failed to track listing view:', error);
  }
};

/**
 * Track a search event
 * @param {object} searchParams - Search parameters used
 * @param {object} metadata - Additional metadata
 */
export const trackSearch = async (searchParams, metadata = {}) => {
  try {
    const userInfo = getUserInfo();
    
    await api.post('/api/analytics/track', {
      eventType: 'search',
      userId: userInfo.userId,
      userType: userInfo.userType,
      pageName: window.location.pathname,
      pageUrl: window.location.href,
      sessionId: getSessionId(),
      city: userInfo.city,
      state: userInfo.state,
      metadata: {
        ...searchParams,
        ...metadata
      }
    });
  } catch (error) {
    console.warn('Failed to track search:', error);
  }
};

/**
 * Track a section view (for tracking least viewed sections)
 * @param {string} sectionName - Name of the section (e.g., 'amenities', 'reviews')
 * @param {object} metadata - Additional metadata
 */
export const trackSectionView = async (sectionName, metadata = {}) => {
  try {
    const userInfo = getUserInfo();
    
    await api.post('/api/analytics/track', {
      eventType: 'section_view',
      userId: userInfo.userId,
      userType: userInfo.userType,
      pageName: window.location.pathname,
      pageUrl: window.location.href,
      sectionName,
      sessionId: getSessionId(),
      city: userInfo.city,
      state: userInfo.state,
      metadata
    });
  } catch (error) {
    console.warn('Failed to track section view:', error);
  }
};

/**
 * Track a booking click
 * @param {string} listingId - ID of the listing
 * @param {string} listingType - Type of listing (Flight, Hotel, Car)
 * @param {object} metadata - Additional metadata
 */
export const trackBookingClick = async (listingId, listingType, metadata = {}) => {
  try {
    const userInfo = getUserInfo();
    
    await api.post('/api/analytics/track', {
      eventType: 'booking_click',
      userId: userInfo.userId,
      userType: userInfo.userType,
      listingId,
      listingType,
      pageName: window.location.pathname,
      pageUrl: window.location.href,
      sessionId: getSessionId(),
      city: userInfo.city,
      state: userInfo.state,
      metadata
    });
  } catch (error) {
    console.warn('Failed to track booking click:', error);
  }
};

/**
 * Track a filter applied event
 * @param {object} filters - Filters that were applied
 * @param {object} metadata - Additional metadata
 */
export const trackFilterApplied = async (filters, metadata = {}) => {
  try {
    const userInfo = getUserInfo();
    
    await api.post('/api/analytics/track', {
      eventType: 'filter_applied',
      userId: userInfo.userId,
      userType: userInfo.userType,
      pageName: window.location.pathname,
      pageUrl: window.location.href,
      sessionId: getSessionId(),
      city: userInfo.city,
      state: userInfo.state,
      metadata: {
        ...filters,
        ...metadata
      }
    });
  } catch (error) {
    console.warn('Failed to track filter applied:', error);
  }
};

// Export all tracking functions
export default {
  trackPageView,
  trackListingClick,
  trackListingView,
  trackSearch,
  trackSectionView,
  trackBookingClick,
  trackFilterApplied
};

