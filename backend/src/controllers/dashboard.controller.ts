import { Request, Response, NextFunction } from 'express';
import { DashboardService } from '../services/dashboard/dashboard.service';
import { AppError } from '../errors/app-error';
import { ErrorCodes } from '../errors/error-codes';

export class DashboardController {
  private readonly dashboardService: DashboardService;

  constructor() {
    this.dashboardService = new DashboardService();
  }

  get = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      if (!req.user) {
        throw new AppError(ErrorCodes.UNAUTHORIZED, {
          message: 'Autenticación requerida.',
          statusCode: 401,
        });
      }
      const periodId = req.params.periodId;
      const dashboard = await this.dashboardService.getDashboard(req.user.id, periodId);
      res.status(200).json({ dashboard });
    } catch (error) {
      next(error);
    }
  };
}
