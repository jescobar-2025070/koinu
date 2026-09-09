import { pool } from '../../config/db';
import { AppError } from '../../errors/app-error';
import { ErrorCodes } from '../../errors/error-codes';
import { MovimientoAuditoria } from '../../entities/movimiento-auditoria.entity';
import { PeriodoRepository } from '../../repositories/periodo.repository';
import { MovimientoAuditoriaRepository } from '../../repositories/movimiento-auditoria.repository';

export class AuditoriaService {
  private readonly periodoRepository: PeriodoRepository;
  private readonly auditoriaRepository: MovimientoAuditoriaRepository;

  constructor() {
    this.periodoRepository = new PeriodoRepository(pool);
    this.auditoriaRepository = new MovimientoAuditoriaRepository(pool);
  }

  async listByPeriodo(userId: string, periodoId: string): Promise<MovimientoAuditoria[]> {
    const periodo = await this.periodoRepository.findById(periodoId);
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
    return this.auditoriaRepository.findByPeriodo(userId, periodoId);
  }
}