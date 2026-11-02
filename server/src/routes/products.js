import { Router } from 'express';
import {
  getAllProducts,
  getProductById,
  lookupProductByCode,
  createProduct,
  updateProduct,
  deleteProduct
} from '../controllers/productController.js';
import { authenticate } from '../middleware/auth.js';
import { requireRole } from '../middleware/roles.js';
import { checkTenantAccess } from '../middleware/tenant.js';

const router = Router();

// Todas las rutas requieren autenticación y validación de suscripción multi-tenant
router.use(authenticate);
router.use(checkTenantAccess);

// Búsqueda y escáner rápido
router.get('/lookup/:code', lookupProductByCode);
router.get('/lookup', lookupProductByCode);

// Listado y detalle
router.get('/', getAllProducts);
router.get('/:id', getProductById);

// Gestión exclusiva para Administradores
router.post('/', requireRole('ADMINISTRADOR'), createProduct);
router.put('/:id', requireRole('ADMINISTRADOR'), updateProduct);
router.delete('/:id', requireRole('ADMINISTRADOR'), deleteProduct);

export default router;
