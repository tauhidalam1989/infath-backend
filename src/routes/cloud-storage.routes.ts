import { Router } from 'express';
import * as cloudStorageController from '../controllers/cloud-storage.controller';

const router = Router();

router.get('/config', cloudStorageController.getConfig);
router.post('/config', cloudStorageController.saveConfig);
router.post('/test-config', cloudStorageController.testConfig);
router.post('/generate-sas-token', cloudStorageController.generateSasToken);

export default router;

