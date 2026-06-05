import { Router } from 'express';
import multer from 'multer';
import * as advertisementsController from '../controllers/advertisements.controller';

const router = Router();

// Configure multer for file uploads (memory storage)
const upload = multer({
  storage: multer.memoryStorage(),
  limits: {
    fileSize: 200 * 1024 * 1024 // 200MB limit (supports 50MB, 100MB, 200MB videos)
  },
  fileFilter: (req, file, cb) => {
    // Allow images, videos, presentations, and documents
    const allowedMimes = [
      // Images
      'image/jpeg', 'image/jpg', 'image/png', 'image/gif', 'image/webp',
      // Videos
      'video/mp4', 'video/mpeg', 'video/quicktime', 'video/x-msvideo', 'video/webm',
      // Presentations
      'application/vnd.ms-powerpoint', 'application/vnd.openxmlformats-officedocument.presentationml.presentation',
      // Documents
      'application/pdf', 'application/msword', 'application/vnd.openxmlformats-officedocument.wordprocessingml.document'
    ];

    if (allowedMimes.includes(file.mimetype)) {
      cb(null, true);
    } else {
      cb(new Error('Invalid file type. Only images, videos, presentations, and documents are allowed.'));
    }
  }
});

router.get('/', advertisementsController.getAdvertisements);
router.get('/:id', advertisementsController.getAdvertisementById);
router.post('/', upload.single('file'), advertisementsController.createAdvertisement);
router.put('/:id', upload.single('file'), advertisementsController.updateAdvertisement);
router.delete('/:id', advertisementsController.deleteAdvertisement);

export default router;

