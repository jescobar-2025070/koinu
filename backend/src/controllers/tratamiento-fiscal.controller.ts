import { Request, Response, NextFunction } from 'express';
import { pool } from '../config/db';
import { AppError } from '../errors/app-error';
import { ErrorCodes } from '../errors/error-codes';
import { TratamientoFiscalRepository } from '../repositories/tratamiento-fiscal.repository';

export class TratamientoFiscalController {
  private readonly repository: TratamientoFiscalRepository;

  constructor() {
    this.repository = new TratamientoFiscalRepository(pool);
  }

  private requireUser(req: Request): void {
    if (!req.user) {
      throw new AppError(ErrorCodes.UNAUTHORIZED, {
        message: 'Autenticación requerida.',
        statusCode: 401,
      });
    }
  }

  list = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      this.requireUser(req);
      const tratamientos = await this.repository.findAll();
      res.status(200).json({ tratamientos });
    } catch (error) {
      next(error);
    }
  };
}