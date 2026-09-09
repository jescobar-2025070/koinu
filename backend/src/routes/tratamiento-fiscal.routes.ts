import { Router } from 'express';
import { TratamientoFiscalController } from '../controllers/tratamiento-fiscal.controller';
import { authenticate } from '../middleware/authenticate';

export function tratamientoFiscalRouter(): Router {
  const router = Router();
  const controller = new TratamientoFiscalController();

  router.get('/', authenticate, controller.list);

  return router;
}