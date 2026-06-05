import { Router } from 'express';
import * as subsitesController from '../controllers/subsites.controller';

const router = Router();

// Get all subsites
router.get('/', subsitesController.getSubsites);

// Get subsite by ID
router.get('/:id', subsitesController.getSubsiteById);

// Create new subsite
router.post('/', subsitesController.createSubsite);

// Update subsite
router.put('/:id', subsitesController.updateSubsite);

// Delete subsite
router.delete('/:id', subsitesController.deleteSubsite);

export default router;

