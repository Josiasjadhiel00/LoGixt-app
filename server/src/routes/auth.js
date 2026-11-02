import { Router } from 'express';
import {
  login,
  getProfile,
  updateProfile,
  updatePreferences,
  changePassword
} from '../controllers/authController.js';
import { authenticate } from '../middleware/auth.js';

const router = Router();

router.post('/login', login);
router.get('/me', authenticate, getProfile);
router.put('/profile', authenticate, updateProfile);
router.put('/preferences', authenticate, updatePreferences);
router.post('/change-password', authenticate, changePassword);

export default router;
