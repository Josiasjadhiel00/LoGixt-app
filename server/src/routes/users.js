import { Router } from 'express';
import {
  getAllUsers,
  createUser,
  toggleUserStatus,
  resetPassword,
  deleteUser
} from '../controllers/userController.js';
import { authenticate } from '../middleware/auth.js';
import { requireRole } from '../middleware/roles.js';
import { checkTenantAccess } from '../middleware/tenant.js';

const router = Router();

// Exclusivo para ADMINISTRADOR con suscripción activa de su empresa
router.use(authenticate);
router.use(checkTenantAccess);
router.use(requireRole('ADMINISTRADOR'));

router.get('/', getAllUsers);
router.post('/', createUser);
router.patch('/:id/toggle-status', toggleUserStatus);
router.post('/:id/reset-password', resetPassword);
router.delete('/:id', deleteUser);

export default router;
