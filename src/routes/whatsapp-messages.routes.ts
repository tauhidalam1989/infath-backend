import { Router } from 'express';
import * as whatsappMessagesController from '../controllers/whatsapp-messages.controller';

const router = Router();

router.get('/', whatsappMessagesController.getMessages);
router.get('/:id', whatsappMessagesController.getMessageById);
router.post('/', whatsappMessagesController.sendMessages);
router.put('/:id/status', whatsappMessagesController.updateMessageStatus);
router.delete('/:id', whatsappMessagesController.deleteMessage);

export default router;

