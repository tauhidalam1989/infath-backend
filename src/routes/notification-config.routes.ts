import { Router } from 'express';
import * as notificationConfigController from '../controllers/notification-config.controller';

const router = Router();

router.get('/', notificationConfigController.getChannelConfigs);
router.get('/:channelType', notificationConfigController.getChannelConfig);
router.post('/:channelType', notificationConfigController.upsertChannelConfig);
router.put('/:channelType/status', notificationConfigController.updateChannelStatus);
router.post('/:channelType/test', notificationConfigController.testChannelConfig);

export default router;

