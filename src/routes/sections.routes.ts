import { Router } from 'express';
import * as sectionsController from '../controllers/sections.controller';

const router = Router();

// Get all sections
router.get('/', sectionsController.getSections);

// Get section by ID
router.get('/:id', sectionsController.getSectionById);

// Create new section
router.post('/', sectionsController.createSection);

// Update section
router.put('/:id', sectionsController.updateSection);

// Delete section
router.delete('/:id', sectionsController.deleteSection);

export default router;

