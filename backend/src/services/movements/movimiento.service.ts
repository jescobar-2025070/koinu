import { pool, withTransaction } from '../../config/db';
import { AppError } from '../../errors/app-error';
import { ErrorCodes } from '../../errors/error-codes';
import { Movimiento, MovimientoType } from '../../entities/movimiento.entity';
import { PeriodoRepository } from '../../repositories/periodo.repository';
import { MovimientoRepository } from '../../repositories/movimiento.repository';
import { DetalleIngresoRepository } from '../../repositories/detalle-ingreso.repository';
import { CategoriaIngresoRepository } from '../../repositories/categoria-ingreso.repository';
import { CategoriaGastoRepository } from '../../repositories/categoria-gasto.repository';
import { BudgetService } from '../budgets/budget.service';

export interface CrearMovimientoInput {
  periodId: string;
  type: MovimientoType;
  incomeCategoryId?: string;
  expenseCategoryId?: string;
  grossAmount?: number;
  retentionAmount?: number;
  taxTreatmentId?: string;
  amount?: number;
  description?: string;
  date?: string;
}

export class MovimientoService {
  private readonly movimientoRepository: MovimientoRepository;
  private readonly periodoRepository: PeriodoRepository;
  private readonly categoriaIngresoRepository: CategoriaIngresoRepository;
  private readonly categoriaGastoRepository: CategoriaGastoRepository;

  constructor() {
    this.movimientoRepository = new MovimientoRepository(pool);
    this.periodoRepository = new PeriodoRepository(pool);
    this.categoriaIngresoRepository = new CategoriaIngresoRepository(pool);
    this.categoriaGastoRepository = new CategoriaGastoRepository(pool);
  }

  async findByUser(userId: string, periodId?: string): Promise<Movimiento[]> {
    return this.movimientoRepository.findByUser(userId, periodId);
  }

  async create(userId: string, data: CrearMovimientoInput): Promise<{ movimiento: Movimiento; detalle?: import('../../entities/detalle-ingreso.entity').DetalleIngreso }> {
    const periodo = await this.periodoRepository.findById(data.periodId);
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
    if (periodo.status !== 'ACTIVE') {
      throw new AppError(ErrorCodes.VALIDATION_ERROR, {
        message: 'Solo se pueden registrar movimientos en un período activo.',
        statusCode: 400,
      });
    }

    const fecha = data.date ? new Date(data.date) : new Date();
    if (fecha < periodo.startDate || fecha > periodo.endDate) {
      throw new AppError(ErrorCodes.DATE_OUTSIDE_PERIOD, {
        message: 'La fecha está fuera del periodo seleccionado.',
        statusCode: 422,
      });
    }

    if (data.type === 'INCOME') {
      return this.createIngreso(userId, data, periodo.id, fecha);
    }
    return this.createGasto(userId, data, periodo.id, fecha);
  }

  private async createIngreso(
    userId: string,
    data: CrearMovimientoInput,
    periodoId: string,
    fecha: Date,
  ): Promise<{ movimiento: Movimiento; detalle: import('../../entities/detalle-ingreso.entity').DetalleIngreso }> {
    if (!data.incomeCategoryId) {
      throw new AppError(ErrorCodes.VALIDATION_ERROR, {
        message: 'La categoría de ingreso es obligatoria.',
        statusCode: 400,
      });
    }

    const categoria = await this.categoriaIngresoRepository.findById(data.incomeCategoryId);
    if (!categoria || (categoria.userId !== null && categoria.userId !== userId)) {
      throw new AppError(ErrorCodes.FORBIDDEN, {
        message: 'Categoría de ingreso no válida.',
        statusCode: 403,
      });
    }

    const gross = data.grossAmount ?? data.amount;
    if (typeof gross !== 'number' || isNaN(gross) || gross <= 0) {
      throw new AppError(ErrorCodes.VALIDATION_ERROR, {
        message: 'El monto bruto debe ser un número mayor a 0.',
        statusCode: 400,
      });
    }
    const retention = data.retentionAmount ?? 0;
    if (retention < 0 || retention > gross) {
      throw new AppError(ErrorCodes.VALIDATION_ERROR, {
        message: 'La retención debe ser un valor entre 0 y el monto bruto.',
        statusCode: 400,
      });
    }
    const net = gross - retention;

    return withTransaction(async (client) => {
      const movimientoRepo = new MovimientoRepository(client);
      const detalleRepo = new DetalleIngresoRepository(client);

      const movimiento = await movimientoRepo.create({
        userId,
        periodoId,
        type: 'INCOME',
        incomeCategoryId: data.incomeCategoryId,
        amount: net,
        description: data.description,
        date: fecha,
      });

      const detalle = await detalleRepo.create({
        movementId: movimiento.id,
        taxTreatmentId: data.taxTreatmentId ?? null,
        grossAmount: gross,
        retentionAmount: retention,
        netAmount: net,
      });

      const budgetService = new BudgetService();
      await budgetService.recomputeOverruns(client, periodoId);

      return { movimiento, detalle };
    });
  }

  private async createGasto(
    userId: string,
    data: CrearMovimientoInput,
    periodoId: string,
    fecha: Date,
  ): Promise<{ movimiento: Movimiento }> {
    if (!data.expenseCategoryId) {
      throw new AppError(ErrorCodes.VALIDATION_ERROR, {
        message: 'La categoría de gasto es obligatoria.',
        statusCode: 400,
      });
    }

    const categoria = await this.categoriaGastoRepository.findById(data.expenseCategoryId);
    if (!categoria || (categoria.userId !== null && categoria.userId !== userId)) {
      throw new AppError(ErrorCodes.FORBIDDEN, {
        message: 'Categoría de gasto no válida.',
        statusCode: 403,
      });
    }

    const amount = data.amount;
    if (typeof amount !== 'number' || isNaN(amount) || amount <= 0) {
      throw new AppError(ErrorCodes.VALIDATION_ERROR, {
        message: 'El monto debe ser un número mayor a 0.',
        statusCode: 400,
      });
    }

    return withTransaction(async (client) => {
      const movimientoRepo = new MovimientoRepository(client);
      const movimiento = await movimientoRepo.create({
        userId,
        periodoId,
        type: 'EXPENSE',
        expenseCategoryId: data.expenseCategoryId,
        amount,
        description: data.description,
        date: fecha,
      });

      const budgetService = new BudgetService();
      await budgetService.recomputeOverruns(client, periodoId);

      return { movimiento };
    });
  }

  async getById(id: string, userId: string): Promise<{ movimiento: Movimiento; detalle?: import('../../entities/detalle-ingreso.entity').DetalleIngreso } | null> {
    const movimiento = await this.movimientoRepository.findById(id);
    if (!movimiento || movimiento.userId !== userId) {
      return null;
    }
    if (movimiento.type === 'INCOME') {
      const detalleRepo = new DetalleIngresoRepository(pool);
      const detalle = await detalleRepo.findById(movimiento.id);
      return { movimiento, detalle: detalle ?? undefined };
    }
    return { movimiento };
  }

  async delete(id: string, userId: string): Promise<void> {
    const movimiento = await this.movimientoRepository.findById(id);
    if (!movimiento) {
      throw new AppError(ErrorCodes.NOT_FOUND, {
        message: 'Movimiento no encontrado.',
        statusCode: 404,
      });
    }
    if (movimiento.userId !== userId) {
      throw new AppError(ErrorCodes.FORBIDDEN, {
        message: 'No tienes acceso a este movimiento.',
        statusCode: 403,
      });
    }

    const periodo = await this.periodoRepository.findById(movimiento.periodoId);
    if (!periodo || periodo.status !== 'ACTIVE') {
      throw new AppError(ErrorCodes.VALIDATION_ERROR, {
        message: 'Solo se pueden eliminar movimientos de un período activo.',
        statusCode: 400,
      });
    }

    return withTransaction(async (client) => {
      const movimientoRepo = new MovimientoRepository(client);
      const deleted = await movimientoRepo.delete(id);
      if (!deleted) {
        throw new AppError(ErrorCodes.INTERNAL_ERROR, {
          message: 'Error al eliminar el movimiento.',
          statusCode: 500,
        });
      }
      const budgetService = new BudgetService();
      await budgetService.recomputeOverruns(client, movimiento.periodoId);
    });
  }

  async update(
    id: string,
    userId: string,
    data: { amount?: number; description?: string; date?: string },
  ): Promise<Movimiento> {
    const movimiento = await this.movimientoRepository.findById(id);
    if (!movimiento) {
      throw new AppError(ErrorCodes.NOT_FOUND, {
        message: 'Movimiento no encontrado.',
        statusCode: 404,
      });
    }
    if (movimiento.userId !== userId) {
      throw new AppError(ErrorCodes.FORBIDDEN, {
        message: 'No tienes acceso a este movimiento.',
        statusCode: 403,
      });
    }

    const periodo = await this.periodoRepository.findById(movimiento.periodoId);
    if (!periodo || periodo.status !== 'ACTIVE') {
      throw new AppError(ErrorCodes.VALIDATION_ERROR, {
        message: 'Solo se pueden editar movimientos de un período activo.',
        statusCode: 400,
      });
    }

    const payload: { amount?: number; description?: string; date?: Date } = {};
    if (data.amount !== undefined) {
      if (typeof data.amount !== 'number' || isNaN(data.amount) || data.amount <= 0) {
        throw new AppError(ErrorCodes.VALIDATION_ERROR, {
          message: 'El monto debe ser un número mayor a 0.',
          statusCode: 400,
        });
      }
      payload.amount = data.amount;
    }
    if (data.description !== undefined) {
      payload.description = data.description;
    }
    if (data.date !== undefined) {
      const fecha = new Date(data.date);
      if (isNaN(fecha.getTime())) {
        throw new AppError(ErrorCodes.VALIDATION_ERROR, {
          message: 'La fecha no tiene un formato válido.',
          statusCode: 400,
        });
      }
      if (fecha < periodo.startDate || fecha > periodo.endDate) {
        throw new AppError(ErrorCodes.DATE_OUTSIDE_PERIOD, {
          message: 'La fecha está fuera del periodo seleccionado.',
          statusCode: 422,
        });
      }
      payload.date = fecha;
    }

    const updated = await this.movimientoRepository.update(id, payload);
    if (!updated) {
      throw new AppError(ErrorCodes.INTERNAL_ERROR, {
        message: 'Error al actualizar el movimiento.',
        statusCode: 500,
      });
    }
    return updated;
  }

  async getStats(userId: string, periodId?: string): Promise<{ totalIngresos: number; totalGastos: number }> {
    return this.movimientoRepository.getStats(userId, periodId);
  }
}
