import express from 'express';
import { authenticate } from '../middleware/auth.js';
import { requireRole } from '../middleware/roles.js';
import { paymentsDisabled } from '../middleware/paymentsDisabled.js';

const router = express.Router();

router.post('/payments', paymentsDisabled);

router.post('/simulate', authenticate, requireRole('SUPERADMIN'), paymentsDisabled);

export default router;
