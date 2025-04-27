const geolib = require('geolib');
const { PrismaClient } = require('@prisma/client');
const logger = require('../utils/logger');

const prisma = new PrismaClient();

/**
 * Calculate distance between two points and check if within radius
 * @param {Object} point1 - First point with latitude and longitude
 * @param {Object} point2 - Second point with latitude and longitude
 * @param {Number} radius - Radius in meters
 * @returns {Boolean} Whether point1 is within radius of point2
 */
exports.isWithinRadius = (point1, point2, radius) => {
  // Convert points to format expected by geolib
  const p1 = {
    latitude: parseFloat(point1.latitude),
    longitude: parseFloat(point1.longitude)
  };
  
  const p2 = {
    latitude: parseFloat(point2.latitude),
    longitude: parseFloat(point2.longitude)
  };
  
  // Calculate distance in meters
  const distance = geolib.getDistance(p1, p2);
  
  // Check if within radius
  return distance <= radius;
};

/**
 * Find the nearest valid location for absensi
 * @param {Object} userLocation - User's location with latitude and longitude
 * @param {Array} locations - Array of valid locations
 * @returns {Object|null} Nearest location if within radius, null otherwise
 */
exports.findNearestLocation = async (userLocation, locations) => {
  // If no locations provided, return null
  if (!locations || locations.length === 0) {
    return null;
  }
  
  // Get max allowed radius error from settings
  const maxRadiusSetting = await prisma.setting.findUnique({
    where: { key: 'max_radius_error' }
  });
  
  const defaultMaxRadius = 100; // Default 100 meters
  const maxRadiusError = maxRadiusSetting 
    ? parseInt(maxRadiusSetting.value) 
    : defaultMaxRadius;
  
  // Convert user location to format expected by geolib
  const userPoint = {
    latitude: parseFloat(userLocation.latitude),
    longitude: parseFloat(userLocation.longitude)
  };
  
  // Convert locations to format expected by geolib and add distance
  const locationsWithDistance = locations.map(location => {
    const point = {
      latitude: parseFloat(location.latitude),
      longitude: parseFloat(location.longitude)
    };
    
    const distance = geolib.getDistance(userPoint, point);
    
    return {
      ...location,
      distance
    };
  });
  
  // Sort locations by distance
  locationsWithDistance.sort((a, b) => a.distance - b.distance);
  
  // Get the nearest location
  const nearestLocation = locationsWithDistance[0];
  
  // Check if within radius + max error
  if (nearestLocation.distance <= (nearestLocation.radius + maxRadiusError)) {
    logger.info(`User at location (${userPoint.latitude}, ${userPoint.longitude}) is within radius of ${nearestLocation.nama} (${nearestLocation.distance}m of ${nearestLocation.radius}m radius)`);
    return nearestLocation;
  }
  
  // Log the failure for debugging
  logger.warn(`User at location (${userPoint.latitude}, ${userPoint.longitude}) is NOT within radius of any valid location. Nearest is ${nearestLocation.nama} at ${nearestLocation.distance}m (radius: ${nearestLocation.radius}m)`);
  return null;
};

/**
 * Get location details by ID
 * @param {Number} id - Location ID
 * @returns {Object|null} Location details
 */
exports.getLocationById = async (id) => {
  try {
    const location = await prisma.lokasiAbsensi.findUnique({
      where: { id: parseInt(id) }
    });
    
    return location;
  } catch (error) {
    logger.error(`Error getting location by ID: ${error.message}`);
    return null;
  }
};

/**
 * Format location for response
 * @param {Object} location - Location object from database
 * @returns {Object} Formatted location
 */
exports.formatLocation = (location) => {
  if (!location) return null;
  
  return {
    id: location.id,
    nama: location.nama,
    latitude: location.latitude.toString(),
    longitude: location.longitude.toString(),
    radius: location.radius,
    isActive: location.isActive
  };
};

/**
 * Get all valid locations for a specific kelas
 * @param {Number} kelasId - Kelas ID
 * @returns {Array} Array of valid locations
 */
exports.getValidLocationsForKelas = async (kelasId) => {
  try {
    const kelasLokasi = await prisma.kelasLokasi.findMany({
      where: { 
        kelasId: parseInt(kelasId)
      },
      include: {
        lokasi: true
      }
    });
    
    // Filter active locations only
    return kelasLokasi
      .filter(kl => kl.lokasi.isActive)
      .map(kl => kl.lokasi);
  } catch (error) {
    logger.error(`Error getting valid locations for kelas: ${error.message}`);
    return [];
  }
};

/**
 * Validate coordinates format
 * @param {String|Number} latitude - Latitude value
 * @param {String|Number} longitude - Longitude value
 * @returns {Object} Validation result
 */
exports.validateCoordinates = (latitude, longitude) => {
  const latNum = parseFloat(latitude);
  const longNum = parseFloat(longitude);
  
  if (isNaN(latNum) || isNaN(longNum)) {
    return {
      isValid: false,
      message: 'Latitude dan longitude harus berupa angka'
    };
  }
  
  if (latNum < -90 || latNum > 90) {
    return {
      isValid: false,
      message: 'Latitude harus berada di antara -90 dan 90'
    };
  }
  
  if (longNum < -180 || longNum > 180) {
    return {
      isValid: false,
      message: 'Longitude harus berada di antara -180 dan 180'
    };
  }
  
  return {
    isValid: true,
    latitude: latNum,
    longitude: longNum
  };
};

module.exports = exports;