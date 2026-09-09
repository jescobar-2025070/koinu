import { Router } from 'express';
import { PeriodoController } from '../controllers/periodo.controller';
import { authenticate } from '../middleware/authenticate';
import { requireRole } from '../middleware/authorize';

export function adminRouter(): Router {
  const router = Router();
  const controller = new PeriodoController();

  router.use(authenticate, requireRole('ADMIN'));

  router.get('/periods', controller.listAdmin);
  router.post('/periods/:id/cancel', controller.cancelAdmin);

  return router;
}