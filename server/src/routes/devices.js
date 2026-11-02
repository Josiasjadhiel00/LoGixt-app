import express from 'express';
import { authenticate } from '../middleware/auth.js';
import { checkTenantAccess } from '../middleware/tenant.js';
import {
  getMyDevices,
  activateDeviceWithCode,
  pingDevice
} from '../controllers/deviceController.js';

const router = express.Router();

router.use(authenticate);
router.use(checkTenantAccess);

router.get('/', getMyDevices);
router.post('/activate', activateDeviceWithCode);
router.post('/:id/ping', pingDevice);

export default router;
