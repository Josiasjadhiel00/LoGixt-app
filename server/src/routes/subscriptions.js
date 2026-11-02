import express from 'express';
import { authenticate } from '../middleware/auth.js';
import { getMySubscription, simulatePayment } from '../controllers/subscriptionController.js';

const router = express.Router();

router.use(authenticate);

router.get('/my-subscription', getMySubscription);
router.post('/simulate-payment', simulatePayment);

export default router;
