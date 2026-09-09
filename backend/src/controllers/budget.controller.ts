import { Request, Response, NextFunction } from 'express';
import { BudgetService } from '../services/budgets/budget.service';
import { AppError } from '../errors/app-error';
import { ErrorCodes } from '../errors/error-codes';

export class BudgetController {
  private readonly budgetService: BudgetService;

  constructor() {
    this.budgetService = new BudgetService();
  }

  private requireUser(req: Request): string {
    if (!req.user) {
      throw new AppError(ErrorCodes.UNAUTHORIZED, {
        message: 'Autenticación requerida.',
        statusCode: 401,
      });
    }
    return req.user.id;
  }

  getBudget = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const userId = this.requireUser(req);
      const budget = await this.budgetService.getBudget(req.params.periodId, userId);
      res.status(200).json(budget);
    } catch (error) {
      next(error);
    }
  };

  syncBudget = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const userId = this.requireUser(req);
      const presupuesto = await this.budgetService.syncBudget(req.params.periodId, userId);
      res.status(200).json({ presupuesto });
    } catch (error) {
      next(error);
    }
  };

  listAllocations = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const userId = this.requireUser(req);
      const asignaciones = await this.budgetService.listAllocations(req.params.periodId, userId);
      res.status(200).json({ asignaciones });
    } catch (error) {
      next(error);
    }
  };

  createAllocation = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const userId = this.requireUser(req);
      const asignacion = await this.budgetService.createAllocation(
        req.params.periodId,
        userId,
        req.body.categoriaGastoId,
        req.body.amount,
      );
      res.status(201).json({ asignacion });
    } catch (error) {
      next(error);
    }
  };

  updateAllocation = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const userId = this.requireUser(req);
      const asignacion = await this.budgetService.updateAllocation(
        req.params.id,
        userId,
        req.body.amount,
      );
      res.status(200).json({ asignacion });
    } catch (error) {
      next(error);
    }
  };

  deleteAllocation = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const userId = this.requireUser(req);
      await this.budgetService.deleteAllocation(req.params.id, userId);
      res.status(204).end();
    } catch (error) {
      next(error);
    }
  };

  getOverruns = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const userId = this.requireUser(req);
      const overruns = await this.budgetService.getOverruns(req.params.periodId, userId);
      res.status(200).json(overruns);
    } catch (error) {
      next(error);
    }
  };
}