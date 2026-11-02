import express from 'express';
import { handleWebhook, simulateWebhook } from '../controllers/webhookController.js';

const router = express.Router();

// Endpoint público para recibir webhooks de la pasarela de pagos
router.post('/payments', handleWebhook);

// Endpoint de simulación para pruebas del sistema
router.post('/simulate', simulateWebhook);

export default router;
