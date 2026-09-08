import { Router } from 'express';
import { AuthController } from '../controllers/auth.controller';
import { authenticate } from '../middleware/authenticate';
import { validate } from '../middleware/validate';
import { validateRegisterRequest } from '../validators/auth/register.validator';
import { validateLoginRequest } from '../validators/auth/login.validator';
import { validateGoogleAuthRequest } from '../validators/auth/google.validator';
import { validateRefreshRequest } from '../validators/auth/refresh.validator';
import { validateForgotPasswordRequest } from '../validators/auth/forgot-password.validator';
import { validateResetPasswordRequest } from '../validators/auth/reset-password.validator';

export function authRouter(): Router {
  const router = Router();
  const controller = new AuthController();

  router.post('/register', validate(validateRegisterRequest), controller.register);
  router.post('/login', validate(validateLoginRequest), controller.login);
  router.post('/google', validate(validateGoogleAuthRequest), controller.google);
  router.post('/refresh', validate(validateRefreshRequest), controller.refresh);
  router.post('/logout', authenticate, controller.logout);
  router.post('/forgot-password', validate(validateForgotPasswordRequest), controller.forgotPassword);
  router.post('/reset-password', validate(validateResetPasswordRequest), controller.resetPassword);
  router.get('/me', authenticate, controller.me);

  return router;
}
