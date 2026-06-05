import { Router } from 'express';
import * as screensController from '../controllers/screens.controller';

const router = Router();

// Start network scan
router.post('/scan', screensController.startScan);

// Get scan progress
router.get('/scan/:scanId/status', screensController.getScanStatus);

// Get discovered devices
router.get('/discover', screensController.getDiscoveredDevices);

// Register a screen
router.post('/register', screensController.registerScreen);

// Get all registered screens
router.get('/', screensController.getScreens);

// Create a screen manually
router.post('/', screensController.createScreen);

// Screen groups routes (must be before /:id routes to avoid conflicts)
router.get('/groups', screensController.getScreenGroups);
router.post('/groups', screensController.createScreenGroup);
router.put('/groups/:id', screensController.updateScreenGroup);
router.delete('/groups/:id', screensController.deleteScreenGroup);

// Specific routes with paths (must be before generic /:id route)
router.get('/:id/status', screensController.getScreenStatus);
router.get('/:id/playing', screensController.getPlayingVideo);
router.post('/:id/play', screensController.playVideo);
router.post('/:id/stop', screensController.stopVideo);
router.post('/:id/pause', screensController.pauseVideo);
router.post('/:id/resume', screensController.resumeVideo);
router.post('/:id/fullscreen', screensController.setFullscreen);
router.post('/:id/reset', screensController.resetScreen);
router.post('/:id/refresh', screensController.refreshPlayer);
router.post('/:id/apply-to-group', screensController.applyScreenLayoutToGroup);

// Screen regions routes
router.get('/:id/regions', screensController.getScreenRegions);
router.post('/:id/regions', screensController.createScreenRegion);
router.put('/:id/regions/:regionId', screensController.updateScreenRegion);
router.delete('/:id/regions/:regionId', screensController.deleteScreenRegion);

// Advertisement schedules routes
router.get('/:id/schedules', screensController.getScreenSchedules);
router.post('/:id/schedules', screensController.createAdvertisementSchedule);
router.put('/:id/schedules/:adId', screensController.updateAdvertisementSchedule);
router.delete('/:id/schedules/:adId', screensController.deleteAdvertisementSchedule);

// Get screen by ID (must be after specific routes)
router.get('/:id', screensController.getScreenById);

// Update a screen
router.put('/:id', screensController.updateScreen);

// Delete screen
router.delete('/:id', screensController.deleteScreen);

export default router;

