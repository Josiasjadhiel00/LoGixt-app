import express from 'express';
import { authenticate } from '../middleware/auth.js';
import { paymentsDisabled } from '../middleware/paymentsDisabled.js';
import { getMySubscription } from '../controllers/subscriptionController.js';

const router = express.Router();

router.use(authenticate);

router.get('/my-subscription', getMySubscription);
router.post('/simulate-payment', paymentsDisabled);

export default router;
