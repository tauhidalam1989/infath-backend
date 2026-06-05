import express from 'express';
import {
  getAllNotifications,
  getNotification,
  create,
  update,
  remove,
  send,
  schedule
} from '../controllers/notifications.controller';

const router = express.Router();

// Notification routes
router.get('/', getAllNotifications);
router.get('/:id', getNotification);
router.post('/', create);
router.put('/:id', update);
router.delete('/:id', remove);
router.post('/:id/send', send);
router.post('/:id/schedule', schedule);

export default router;

