import { Router } from 'express';
import { authenticate } from '../middleware/auth.js';
import { checkTenantAccess } from '../middleware/tenant.js';
import {
  getConfig,
  saveConfig,
  createBackup,
  getBackups,
  downloadBackup,
  restoreBackup,
  deleteBackup,
  syncPull,
  syncPush,
  getSyncLogs,
  getAdminStorageStatus,
  getGoogleDriveStatus,
  connectGoogleDrive,
  googleDriveOAuthCallback,
  disconnectGoogleDrive,
  uploadBackupToGoogleDrive,
  getGoogleDriveBackups,
  restoreGoogleDriveBackup
} from '../controllers/storageController.js';

const router = Router();

// Google OAuth redirige aquí sin credenciales Bearer; el state de un solo uso valida la solicitud.
router.get('/google-drive/callback', googleDriveOAuthCallback);

// Todas las rutas de almacenamiento requieren autenticación válida
router.use(authenticate);

router.get('/google-drive/status', getGoogleDriveStatus);
router.get('/google-drive/backups', getGoogleDriveBackups);
router.post('/google-drive/connect', checkTenantAccess, connectGoogleDrive);
router.post('/google-drive/disconnect', disconnectGoogleDrive);
router.post('/google-drive/backups/:fileId/restore', checkTenantAccess, restoreGoogleDriveBackup);

// Configuración de almacenamiento local y en la nube
router.get('/config', getConfig);
router.post('/config', saveConfig);

// Respaldos y copias de seguridad
router.get('/backups', getBackups);
router.post('/backup/create', checkTenantAccess, createBackup);
router.post('/backup/:id/google-drive', checkTenantAccess, uploadBackupToGoogleDrive);
router.get('/backup/:id/download', downloadBackup);
router.post('/backup/:id/restore', checkTenantAccess, restoreBackup);
router.delete('/backup/:id', deleteBackup);

// Sincronización y colas offline
router.post('/sync/pull', checkTenantAccess, syncPull);
router.post('/sync/push', checkTenantAccess, syncPush);
router.get('/logs', getSyncLogs);

// Panel administrativo y de salud
router.get('/admin/status', getAdminStorageStatus);

export default router;
