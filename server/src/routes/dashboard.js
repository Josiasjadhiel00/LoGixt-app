import { Router } from 'express';
import { getDashboardSummary } from '../controllers/dashboardController.js';
import { authenticate } from '../middleware/auth.js';
import { checkTenantAccess } from '../middleware/tenant.js';

const router = Router();

router.use(authenticate);
router.use(checkTenantAccess);
router.get('/summary', getDashboardSummary);

export default router;
