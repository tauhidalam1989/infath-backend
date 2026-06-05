import { Router } from 'express';
import * as specialDivisionsController from '../controllers/specialDivisions.controller';

const router = Router();

// Get all special divisions
router.get('/', specialDivisionsController.getSpecialDivisions);

// Get special division by ID
router.get('/:id', specialDivisionsController.getSpecialDivisionById);

// Create new special division
router.post('/', specialDivisionsController.createSpecialDivision);

// Update special division
router.put('/:id', specialDivisionsController.updateSpecialDivision);

// Delete special division
router.delete('/:id', specialDivisionsController.deleteSpecialDivision);

export default router;

