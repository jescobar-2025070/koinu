import { pool, withTransaction } from '../../config/db';
import { AppError } from '../../errors/app-error';
import { ErrorCodes } from '../../errors/error-codes';
import { Periodo } from '../../entities/periodo.entity';
import { PeriodoRepository } from '../../repositories/periodo.repository';
import { ReportService } from '../reports/report.service';

export class PeriodoService {
  private readonly periodoRepository: PeriodoRepository;

  constructor() {
    this.periodoRepository = new PeriodoRepository(pool);
  }

  async findByUser(userId: string): Promise<Periodo[]> {
    return this.periodoRepository.findByUser(userId);
  }

  async findActive(userId: string): Promise<Periodo | null> {
    return this.periodoRepository.findActive(userId);
  }

  async listForAdmin(): Promise<(Periodo & { userEmail: string })[]> {
    return this.periodoRepository.findAllForAdmin();
  }

  async cancelForAdmin(id: string): Promise<Periodo> {
    const periodo = await this.periodoRepository.findById(id);
    if (!periodo) {
      throw new AppError(ErrorCodes.NOT_FOUND, {
        message: 'Período no encontrado.',
        statusCode: 404,
      });
    }
    if (periodo.status !== 'DRAFT' && periodo.status !== 'ACTIVE') {
      throw new AppError(ErrorCodes.VALIDATION_ERROR, {
        message: 'No se puede cancelar un período en su estado actual.',
        statusCode: 400,
      });
    }

    const cancelled = await this.periodoRepository.setStatus(id, 'CANCELLED');
    if (!cancelled) {
      throw new AppError(ErrorCodes.INTERNAL_ERROR, {
        message: 'Error al cancelar el período.',
        statusCode: 500,
      });
    }
    return cancelled;
  }

  async findById(id: string, userId: string): Promise<Periodo> {
    const periodo = await this.periodoRepository.findById(id);
    if (!periodo) {
      throw new AppError(ErrorCodes.NOT_FOUND, {
        message: 'Período no encontrado.',
        statusCode: 404,
      });
    }
    if (periodo.userId !== userId) {
      throw new AppError(ErrorCodes.FORBIDDEN, {
        message: 'No tienes acceso a este período.',
        statusCode: 403,
      });
    }
    return periodo;
  }

  async create(userId: string, data: { name: string; startDate: Date; endDate: Date }): Promise<Periodo> {
    if (data.startDate > data.endDate) {
      throw new AppError(ErrorCodes.VALIDATION_ERROR, {
        message: 'La fecha de inicio debe ser anterior o igual a la fecha de fin.',
        statusCode: 400,
      });
    }
    return withTransaction(async (client) => {
      const repo = new PeriodoRepository(client);
      const active = await repo.findActive(userId);
      if (active) {
        await repo.setStatus(active.id, 'FINISHED');
        const reportService = new ReportService(client);
        await reportService.generateAndSaveSnapshot(client, active.id, userId);
      }
      return repo.create({
        userId,
        name: data.name,
        startDate: data.startDate,
        endDate: data.endDate,
        status: 'ACTIVE',
      });
    });
  }

  async update(
    id: string,
    userId: string,
    data: { name?: string; startDate?: Date; endDate?: Date },
  ): Promise<Periodo> {
    const periodo = await this.findById(id, userId);
    if (periodo.status !== 'DRAFT') {
      throw new AppError(ErrorCodes.VALIDATION_ERROR, {
        message: 'Solo se pueden modificar períodos en estado DRAFT.',
        statusCode: 400,
      });
    }

    const updated = await this.periodoRepository.update(id, data);
    if (!updated) {
      throw new AppError(ErrorCodes.INTERNAL_ERROR, {
        message: 'Error al actualizar el período.',
        statusCode: 500,
      });
    }
    return updated;
  }

  async activate(id: string, userId: string): Promise<Periodo> {
    const periodo = await this.findById(id, userId);
    if (periodo.status !== 'DRAFT') {
      throw new AppError(ErrorCodes.VALIDATION_ERROR, {
        message: 'Solo se pueden activar períodos en estado DRAFT.',
        statusCode: 400,
      });
    }

    const active = await this.periodoRepository.findActive(userId);
    if (active) {
      throw new AppError(ErrorCodes.VALIDATION_ERROR, {
        message: 'Ya existe un período activo. Finalízalo o cancélalo antes de activar otro.',
        statusCode: 409,
      });
    }

    const activated = await this.periodoRepository.setStatus(id, 'ACTIVE');
    if (!activated) {
      throw new AppError(ErrorCodes.INTERNAL_ERROR, {
        message: 'Error al activar el período.',
        statusCode: 500,
      });
    }
    return activated;
  }

  async finalize(id: string, userId: string): Promise<Periodo> {
    const periodo = await this.findById(id, userId);
    if (periodo.status !== 'ACTIVE') {
      throw new AppError(ErrorCodes.VALIDATION_ERROR, {
        message: 'Solo se pueden finalizar períodos en estado ACTIVE.',
        statusCode: 400,
      });
    }

    return withTransaction(async (client) => {
      const repo = new PeriodoRepository(client);
      const finalized = await repo.setStatus(id, 'FINISHED');
      if (!finalized) {
        throw new AppError(ErrorCodes.INTERNAL_ERROR, {
          message: 'Error al finalizar el período.',
          statusCode: 500,
        });
      }

      const reportService = new ReportService(client);
      await reportService.generateAndSaveSnapshot(client, id, userId);

      return finalized;
    });
  }

  async cancel(id: string, userId: string): Promise<Periodo> {
    const periodo = await this.findById(id, userId);
    if (periodo.status !== 'DRAFT' && periodo.status !== 'ACTIVE') {
      throw new AppError(ErrorCodes.VALIDATION_ERROR, {
        message: 'No se puede cancelar un período en su estado actual.',
        statusCode: 400,
      });
    }

    const cancelled = await this.periodoRepository.setStatus(id, 'CANCELLED');
    if (!cancelled) {
      throw new AppError(ErrorCodes.INTERNAL_ERROR, {
        message: 'Error al cancelar el período.',
        statusCode: 500,
      });
    }
    return cancelled;
  }
}
