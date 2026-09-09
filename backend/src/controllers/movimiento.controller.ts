import { Request, Response, NextFunction } from 'express';
import { MovimientoService, CrearMovimientoInput } from '../services/movements/movimiento.service';
import { AppError } from '../errors/app-error';
import { ErrorCodes } from '../errors/error-codes';

export class MovimientoController {
  private readonly movimientoService: MovimientoService;

  constructor() {
    this.movimientoService = new MovimientoService();
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

  list = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const userId = this.requireUser(req);
      const periodId = req.query.periodId as string | undefined;
      const movimientos = await this.movimientoService.findByUser(userId, periodId);
      res.status(200).json({ movimientos });
    } catch (error) {
      next(error);
    }
  };

  create = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const userId = this.requireUser(req);
      const data: CrearMovimientoInput = {
        periodId: req.body.periodId,
        type: req.body.type,
        incomeCategoryId: req.body.incomeCategoryId,
        expenseCategoryId: req.body.expenseCategoryId,
        grossAmount: req.body.grossAmount,
        retentionAmount: req.body.retentionAmount,
        taxTreatmentId: req.body.taxTreatmentId,
        amount: req.body.amount,
        incomeClassification: req.body.incomeClassification,
        expenseType: req.body.expenseType,
        description: req.body.description,
        date: req.body.date,
      };
      const result = await this.movimientoService.create(userId, data);
      res.status(201).json(result);
    } catch (error) {
      next(error);
    }
  };

  delete = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const userId = this.requireUser(req);
      await this.movimientoService.delete(req.params.id, userId);
      res.status(204).end();
    } catch (error) {
      next(error);
    }
  };

  update = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const userId = this.requireUser(req);
      const movimiento = await this.movimientoService.update(req.params.id, userId, req.body);
      res.status(200).json({ movimiento });
    } catch (error) {
      next(error);
    }
  };

  getById = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const userId = this.requireUser(req);
      const result = await this.movimientoService.getById(req.params.id, userId);
      if (!result) {
        throw new AppError(ErrorCodes.NOT_FOUND, {
          message: 'Movimiento no encontrado.',
          statusCode: 404,
        });
      }
      res.status(200).json(result);
    } catch (error) {
      next(error);
    }
  };

  stats = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const userId = this.requireUser(req);
      const periodId = req.query.periodId as string | undefined;
      const stats = await this.movimientoService.getStats(userId, periodId);
      res.status(200).json(stats);
    } catch (error) {
      next(error);
    }
  };
}
