import { Router } from 'express';
import {
  getAllMovements,
  getMovementById,
  registerInbound,
  registerOutbound,
  registerAdjustment
} from '../controllers/movementController.js';
import { authenticate } from '../middleware/auth.js';
import { requireRole } from '../middleware/roles.js';
import { checkTenantAccess } from '../middleware/tenant.js';

const router = Router();

router.use(authenticate);
router.use(checkTenantAccess);

// Consulta de movimientos (disponible para Almacenero y Administrador)
router.get('/', getAllMovements);
router.get('/:id', getMovementById);

// Registro de entradas y salidas (disponible para ambos roles)
router.post('/inbound', registerInbound);
router.post('/outbound', registerOutbound);

// Ajustes manuales de inventario (exclusivo para Administrador según Sección 11)
router.post('/adjust', requireRole('ADMINISTRADOR'), registerAdjustment);

export default router;
