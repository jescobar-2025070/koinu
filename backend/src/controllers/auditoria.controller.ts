import { Request, Response, NextFunction } from 'express';
import { AuditoriaService } from '../services/auditoria/auditoria.service';
import { AppError } from '../errors/app-error';
import { ErrorCodes } from '../errors/error-codes';

export class AuditoriaController {
  private readonly auditoriaService: AuditoriaService;

  constructor() {
    this.auditoriaService = new AuditoriaService();
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

  listByPeriod = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const userId = this.requireUser(req);
      const auditoria = await this.auditoriaService.listByPeriodo(userId, req.params.periodId);
      res.status(200).json({ auditoria });
    } catch (error) {
      next(error);
    }
  };
}