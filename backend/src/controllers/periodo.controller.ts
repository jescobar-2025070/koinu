import { Request, Response, NextFunction } from 'express';
import { PeriodoService } from '../services/periods/periodo.service';
import { AppError } from '../errors/app-error';
import { ErrorCodes } from '../errors/error-codes';

export class PeriodoController {
  private readonly periodoService: PeriodoService;

  constructor() {
    this.periodoService = new PeriodoService();
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
      const periodos = await this.periodoService.findByUser(userId);
      res.status(200).json({ periodos });
    } catch (error) {
      next(error);
    }
  };

  getById = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const userId = this.requireUser(req);
      const periodo = await this.periodoService.findById(req.params.id, userId);
      res.status(200).json({ periodo });
    } catch (error) {
      next(error);
    }
  };

  create = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const userId = this.requireUser(req);
      const periodo = await this.periodoService.create(userId, {
        name: req.body.name,
        startDate: new Date(req.body.startDate),
        endDate: new Date(req.body.endDate),
      });
      res.status(201).json({ periodo });
    } catch (error) {
      next(error);
    }
  };

  update = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const userId = this.requireUser(req);
      const data: { name?: string; startDate?: Date; endDate?: Date } = {};
      if (req.body.name !== undefined) data.name = req.body.name;
      if (req.body.startDate !== undefined) data.startDate = new Date(req.body.startDate);
      if (req.body.endDate !== undefined) data.endDate = new Date(req.body.endDate);
      const periodo = await this.periodoService.update(req.params.id, userId, data);
      res.status(200).json({ periodo });
    } catch (error) {
      next(error);
    }
  };

  activate = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const userId = this.requireUser(req);
      const periodo = await this.periodoService.activate(req.params.id, userId);
      res.status(200).json({ periodo });
    } catch (error) {
      next(error);
    }
  };

  finalize = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const userId = this.requireUser(req);
      const periodo = await this.periodoService.finalize(req.params.id, userId);
      res.status(200).json({ periodo });
    } catch (error) {
      next(error);
    }
  };

  cancel = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const userId = this.requireUser(req);
      const periodo = await this.periodoService.cancel(req.params.id, userId);
      res.status(200).json({ periodo });
    } catch (error) {
      next(error);
    }
  };

  listAdmin = async (_req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const periodos = await this.periodoService.listForAdmin();
      res.status(200).json({ periodos });
    } catch (error) {
      next(error);
    }
  };

  cancelAdmin = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const periodo = await this.periodoService.cancelForAdmin(req.params.id);
      res.status(200).json({ periodo });
    } catch (error) {
      next(error);
    }
  };
}
