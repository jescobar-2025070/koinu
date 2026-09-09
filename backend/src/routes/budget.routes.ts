import { Router } from 'express';
import { BudgetController } from '../controllers/budget.controller';
import { authenticate } from '../middleware/authenticate';
import { validate } from '../middleware/validate';
import {
  validateAllocationRequest,
  validateUpdateAllocationRequest,
} from '../validators/budgets/allocation.validator';

export function budgetRouter(): Router {
  const router = Router();
  const controller = new BudgetController();

  router.get('/:periodId/budget', authenticate, controller.getBudget);
  router.post('/:periodId/budget', authenticate, controller.syncBudget);

  router.get('/:periodId/budget/allocations', authenticate, controller.listAllocations);
  router.post('/:periodId/budget/allocations', authenticate, validate(validateAllocationRequest), controller.createAllocation);
  router.patch('/budget-allocations/:id', authenticate, validate(validateUpdateAllocationRequest), controller.updateAllocation);
  router.delete('/budget-allocations/:id', authenticate, controller.deleteAllocation);

  router.get('/:periodId/budget/overruns', authenticate, controller.getOverruns);

  return router;
}