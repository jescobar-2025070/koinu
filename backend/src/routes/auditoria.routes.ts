import { Router } from 'express';
import { AuditoriaController } from '../controllers/auditoria.controller';
import { authenticate } from '../middleware/authenticate';

export function auditoriaRouter(): Router {
  const router = Router();
  const controller = new AuditoriaController();

  router.get('/:periodId/audit', authenticate, controller.listByPeriod);

  return router;
}