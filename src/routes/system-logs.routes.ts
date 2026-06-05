import { Router } from 'express';
import * as systemLogController from '../controllers/system-log.controller';

const router = Router();

router.get('/', systemLogController.getLogs);
router.get('/modules/list', systemLogController.getUniqueModules);
router.get('/actions/list', systemLogController.getUniqueActions);
router.get('/:id', systemLogController.getLogById);
router.post('/', systemLogController.createLog);
router.delete('/:id', systemLogController.deleteLog);
router.delete('/cleanup', systemLogController.cleanupOldLogs);

export default router;

