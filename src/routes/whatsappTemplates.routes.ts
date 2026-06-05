import { Router } from 'express';
import {
  getAllTemplates,
  getTemplate,
  createTemplate,
  updateTemplate,
  deleteTemplate,
  useTemplate
} from '../controllers/whatsappTemplates.controller';

const router = Router();

// GET /api/whatsapp-templates - Get all templates with filters
router.get('/', getAllTemplates);

// GET /api/whatsapp-templates/:id - Get a single template
router.get('/:id', getTemplate);

// POST /api/whatsapp-templates - Create a new template
router.post('/', createTemplate);

// PUT /api/whatsapp-templates/:id - Update a template
router.put('/:id', updateTemplate);

// DELETE /api/whatsapp-templates/:id - Delete a template
router.delete('/:id', deleteTemplate);

// POST /api/whatsapp-templates/:id/use - Increment usage count
router.post('/:id/use', useTemplate);

export default router;

