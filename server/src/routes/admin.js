import express from 'express';
import { authenticate } from '../middleware/auth.js';
import { requireRole } from '../middleware/roles.js';
import {
  getPlatformMetrics,
  getAllEmpresas,
  createEmpresa,
  updateEmpresa,
  toggleEmpresaStatus,
  changeEmpresaPlan,
  extendSubscription,
  getEmpresaUsers,
  getEmpresaPayments,
  getEmpresaDevices,
  getEmpresaActivity,
  getAllPlanes,
  updatePlanConfig,
  getSaaSConfig,
  updateSaaSConfig,
  getWebhookLogs,
  getAllDevices,
  createDevice,
  generateDeviceCode,
  toggleDeviceStatus,
  deleteDevice,
  deleteEmpresa,
  deleteUserGlobal,
  getAllSubscriptions,
  getAllPayments,
  getAllUsersGlobal,
  getGlobalActivityLogs
} from '../controllers/adminController.js';

const router = express.Router();

// Todas las rutas de administración de plataforma requieren autenticación y rol SUPERADMIN
router.use(authenticate);
router.use(requireRole('SUPERADMIN'));

// Métricas de plataforma y Dashboard
router.get('/metrics', getPlatformMetrics);

// Gestión de Empresas
router.get('/empresas', getAllEmpresas);
router.post('/empresas', createEmpresa);
router.put('/empresas/:id', updateEmpresa);
router.delete('/empresas/:id', deleteEmpresa);
router.patch('/empresas/:id/toggle-status', toggleEmpresaStatus);
router.patch('/empresas/:id/change-plan', changeEmpresaPlan);
router.post('/empresas/:id/extend-subscription', extendSubscription);
router.get('/empresas/:id/users', getEmpresaUsers);
router.get('/empresas/:id/payments', getEmpresaPayments);
router.get('/empresas/:id/devices', getEmpresaDevices);
router.get('/empresas/:id/activity', getEmpresaActivity);

// Gestión Global de Dispositivos
router.get('/devices', getAllDevices);
router.post('/devices', createDevice);
router.post('/devices/:id/generate-code', generateDeviceCode);
router.post('/devices/:id/regenerate-code', generateDeviceCode);
router.patch('/devices/:id/status', toggleDeviceStatus);
router.delete('/devices/:id', deleteDevice);

// Módulos Globales para SuperAdmin
router.get('/subscriptions', getAllSubscriptions);
router.get('/payments', getAllPayments);
router.get('/users', getAllUsersGlobal);
router.delete('/users/:id', deleteUserGlobal);
router.get('/activity', getGlobalActivityLogs);

// Planes
router.get('/planes', getAllPlanes);
router.put('/planes/:id', updatePlanConfig);

// Configuración Global
router.get('/config', getSaaSConfig);
router.put('/config', updateSaaSConfig);

// Auditoría de Webhooks
router.get('/webhook-logs', getWebhookLogs);

export default router;
