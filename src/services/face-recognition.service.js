const fs = require('fs');
const path = require('path');
const { createCanvas, loadImage } = require('canvas');
const faceapi = require('face-api.js');
const { ApiError } = require('../utils/error-handler');
const logger = require('../utils/logger');

// Path to face-api models
const MODELS_PATH = path.join(__dirname, '../../models');

// Ensure models directory exists
if (!fs.existsSync(MODELS_PATH)) {
  fs.mkdirSync(MODELS_PATH, { recursive: true });
}

// Flag to check if models are loaded
let modelsLoaded = false;

/**
 * Initialize face-api.js and load models
 */
async function loadModels() {
  if (modelsLoaded) return;

  try {
    // Configure face-api.js to use node-canvas
    const { Canvas, Image, ImageData } = require('canvas');
    faceapi.env.monkeyPatch({ Canvas, Image, ImageData });

    // Check if models exist, download them if not
    const modelFiles = [
      'face_recognition_model-weights_manifest.json',
      'face_landmark_68_model-weights_manifest.json',
      'ssd_mobilenetv1_model-weights_manifest.json',
      'face_recognition_model-shard1',
      'face_landmark_68_model-shard1',
      'ssd_mobilenetv1_model-shard1',
      'ssd_mobilenetv1_model-shard2'
    ];

    const missingModels = modelFiles.filter(file => !fs.existsSync(path.join(MODELS_PATH, file)));

    if (missingModels.length > 0) {
      logger.warn('Face-api models not found. Please download models and place them in the models directory');
      throw new Error('Face-api models not found');
    }

    // Load face-api.js models
    await faceapi.nets.ssdMobilenetv1.loadFromDisk(MODELS_PATH);
    await faceapi.nets.faceLandmark68Net.loadFromDisk(MODELS_PATH);
    await faceapi.nets.faceRecognitionNet.loadFromDisk(MODELS_PATH);

    modelsLoaded = true;
    logger.info('Face-api models loaded successfully');
  } catch (error) {
    logger.error('Error loading face-api models:', error);
    throw new Error('Failed to load face recognition models');
  }
}

/**
 * Extract face data from an image for enrollment
 * @param {String} imagePath - Path to the image file
 * @returns {Object} Face data object
 */
exports.extractFaceData = async (imagePath) => {
  try {
    // Load models if not already loaded
    await loadModels();

    // Load image
    const img = await loadImage(imagePath);
    
    // Create canvas
    const canvas = createCanvas(img.width, img.height);
    const ctx = canvas.getContext('2d');
    ctx.drawImage(img, 0, 0, img.width, img.height);

    // Detect all faces with landmarks and descriptors
    const detections = await faceapi.detectAllFaces(canvas)
      .withFaceLandmarks()
      .withFaceDescriptors();

    // Check if a face was detected
    if (detections.length === 0) {
      logger.warn(`No faces detected in image: ${imagePath}`);
      return null;
    }

    // If multiple faces, use the largest one (closest to camera)
    let bestDetection = detections[0];
    if (detections.length > 1) {
      logger.warn(`Multiple faces (${detections.length}) detected in image: ${imagePath}`);
      
      // Find the largest face by detection box area
      bestDetection = detections.reduce((prev, current) => {
        const prevArea = prev.detection.box.area;
        const currentArea = current.detection.box.area;
        return prevArea > currentArea ? prev : current;
      }, detections[0]);
    }

    // Extract face descriptor (128-dimensional feature vector)
    const descriptor = Array.from(bestDetection.descriptor);

    // Also extract detection box for debugging/reference
    const box = {
      x: bestDetection.detection.box.x,
      y: bestDetection.detection.box.y,
      width: bestDetection.detection.box.width,
      height: bestDetection.detection.box.height
    };

    return {
      descriptor,
      box,
      imageSize: {
        width: img.width,
        height: img.height
      },
      timestamp: new Date().toISOString()
    };
  } catch (error) {
    logger.error(`Error extracting face data: ${error.message}`);
    throw new ApiError(500, 'Gagal memproses data wajah');
  }
};

/**
 * Verify face against enrolled data
 * @param {String} imagePath - Path to the image file to verify
 * @param {Object} enrolledFaceData - Previously enrolled face data
 * @returns {Object} Verification result
 */
exports.verifyFace = async (imagePath, enrolledFaceData) => {
  try {
    // Load models if not already loaded
    await loadModels();

    // Load image
    const img = await loadImage(imagePath);
    
    // Create canvas
    const canvas = createCanvas(img.width, img.height);
    const ctx = canvas.getContext('2d');
    ctx.drawImage(img, 0, 0, img.width, img.height);

    // Detect faces in the image
    const detections = await faceapi.detectAllFaces(canvas)
      .withFaceLandmarks()
      .withFaceDescriptors();

    // Check if a face was detected
    if (detections.length === 0) {
      logger.warn(`No faces detected during verification: ${imagePath}`);
      return {
        isMatch: false,
        confidence: 0,
        error: 'Tidak ada wajah terdeteksi'
      };
    }

    // If multiple faces, use the largest one (closest to camera)
    let bestDetection = detections[0];
    if (detections.length > 1) {
      logger.warn(`Multiple faces (${detections.length}) detected during verification: ${imagePath}`);
      
      // Find the largest face by detection box area
      bestDetection = detections.reduce((prev, current) => {
        const prevArea = prev.detection.box.area;
        const currentArea = current.detection.box.area;
        return prevArea > currentArea ? prev : current;
      }, detections[0]);
    }

    // Get enrolled descriptor
    const enrolledDescriptor = new Float32Array(enrolledFaceData.descriptor);
    
    // Get detected descriptor
    const detectedDescriptor = bestDetection.descriptor;
    
    // Calculate Euclidean distance (lower = more similar)
    const distance = faceapi.utils.round(
      faceapi.euclideanDistance(enrolledDescriptor, detectedDescriptor)
    );
    
    // Convert distance to similarity score (0-1, higher = more similar)
    // Typical threshold is around 0.6, where distance < 0.6 is considered a match
    const similarityScore = 1 - Math.min(distance, 1);
    
    // Get threshold from settings or use default
    const thresholdSetting = await prisma.setting.findUnique({
      where: { key: 'verification_threshold' }
    });
    
    const threshold = thresholdSetting ? parseFloat(thresholdSetting.value) : 0.6;
    
    // Determine if it's a match
    const isMatch = similarityScore >= threshold;
    
    logger.info(`Face verification: similarityScore=${similarityScore}, threshold=${threshold}, isMatch=${isMatch}`);
    
    // For security, we'll do liveness detection and anti-spoofing here
    // This is a simplified implementation
    const livenessResult = await performLivenessCheck(canvas);
    
    if (!livenessResult.isLive) {
      logger.warn(`Failed liveness check during verification: ${imagePath}`);
      return {
        isMatch: false,
        confidence: similarityScore,
        error: 'Deteksi wajah hidup gagal'
      };
    }
    
    return {
      isMatch,
      confidence: similarityScore,
      distance,
      threshold
    };
  } catch (error) {
    logger.error(`Error verifying face: ${error.message}`);
    throw new ApiError(500, 'Gagal memverifikasi wajah');
  }
};

/**
 * Perform basic liveness check (anti-spoofing)
 * This is a placeholder for actual liveness detection
 * @param {Canvas} canvas - Canvas with the image
 * @returns {Object} Liveness check result
 */
async function performLivenessCheck(canvas) {
  // In a real implementation, this would check for:
  // - Blink detection
  // - Head movement
  // - Texture analysis (to detect printouts)
  // - Depth information if available
  
  // This is a simplified implementation that always returns true
  // In production, implement proper liveness detection
  return {
    isLive: true,
    confidence: 1.0
  };
}

module.exports = exports;