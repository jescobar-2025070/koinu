import { Router } from 'express';
import { UserController } from '../controllers/user.controller';
import { authenticate } from '../middleware/authenticate';
import { requireRole } from '../middleware/authorize';
import { validate } from '../middleware/validate';
import {
  validateSetActiveRequest,
  validateSetRolesRequest,
  validateUpdateEmailRequest,
} from '../validators/users/update-user.validator';
import { validateCreateUserRequest } from '../validators/users/create-user.validator';
import { validateResetUserPasswordRequest } from '../validators/users/reset-password.validator';

export function userRouter(): Router {
  const router = Router();
  const controller = new UserController();

  router.use(authenticate, requireRole('ADMIN'));

  router.get('/', controller.list);
  router.post('/', validate(validateCreateUserRequest), controller.create);
  router.get('/:id', controller.getById);
  router.patch('/:id', validate(validateUpdateEmailRequest), controller.updateEmail);
  router.patch('/:id/active', validate(validateSetActiveRequest), controller.setActive);
  router.put('/:id/roles', validate(validateSetRolesRequest), controller.setRoles);
  router.post('/:id/reset-password', validate(validateResetUserPasswordRequest), controller.resetPassword);
  router.delete('/:id', controller.delete);

  return router;
}