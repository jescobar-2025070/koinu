import { pool, withTransaction, Db } from '../../config/db';
import { AppError } from '../../errors/app-error';
import { ErrorCodes } from '../../errors/error-codes';
import {
  Movimiento,
  MovimientoType,
  IncomeClassification,
  ExpenseType,
} from '../../entities/movimiento.entity';
import { MovimientoAuditoriaTipo } from '../../entities/movimiento-auditoria.entity';
import { PeriodoRepository } from '../../repositories/periodo.repository';
import { MovimientoRepository } from '../../repositories/movimiento.repository';
import { MovimientoAuditoriaRepository } from '../../repositories/movimiento-auditoria.repository';
import { DetalleIngresoRepository } from '../../repositories/detalle-ingreso.repository';
import { CategoriaIngresoRepository } from '../../repositories/categoria-ingreso.repository';
import { CategoriaGastoRepository } from '../../repositories/categoria-gasto.repository';
import { ObjetivoRepository } from '../../repositories/objetivo.repository';
import { PresupuestoRepository } from '../../repositories/presupuesto.repository';
import { AsignacionPresupuestoRepository } from '../../repositories/asignacion-presupuesto.repository';
import { isAmountTooLarge, MAX_AMOUNT_FORMATTED } from '../../utils/amount.utils';

export interface CrearMovimientoInput {
  periodId: string;
  type: MovimientoType;
  incomeCategoryId?: string;
  expenseCategoryId?: string;
  objetivoId?: string;
  grossAmount?: number;
  retentionAmount?: number;
  taxTreatmentId?: string;
  amount?: number;
  incomeClassification?: IncomeClassification;
  expenseType?: ExpenseType;
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
    if (data.date) {
      this.assertNotFutureDate(data.date);
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

    if (!data.incomeClassification || !['REGULAR', 'OCASIONAL'].includes(data.incomeClassification)) {
      throw new AppError(ErrorCodes.VALIDATION_ERROR, {
        message: 'La clasificación del ingreso debe ser REGULAR u OCASIONAL.',
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

    const objetivoId = this.normalizeObjetivoId(data.objetivoId);
    if (objetivoId) {
      await this.assertObjetivoElegible(objetivoId, userId);
    }

    const gross = data.grossAmount ?? data.amount;
    if (typeof gross !== 'number' || isNaN(gross) || gross <= 0) {
      throw new AppError(ErrorCodes.VALIDATION_ERROR, {
        message: 'El monto bruto debe ser un número mayor a 0.',
        statusCode: 400,
      });
    }
    if (isAmountTooLarge(gross)) {
      throw new AppError(ErrorCodes.AMOUNT_TOO_LARGE, {
        message: `El monto no puede superar Q ${MAX_AMOUNT_FORMATTED}.`,
        statusCode: 422,
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
        objetivoId: objetivoId ?? null,
        amount: net,
        description: data.description,
        incomeClassification: data.incomeClassification,
        date: fecha,
      });

      if (objetivoId) {
        await this.adjustObjetivo(client, objetivoId, net);
      }

      const detalle = await detalleRepo.create({
        movementId: movimiento.id,
        taxTreatmentId: data.taxTreatmentId ?? null,
        grossAmount: gross,
        retentionAmount: retention,
        netAmount: net,
      });

      await this.logAuditoria(client, {
        movimientoId: movimiento.id,
        periodoId,
        userId,
        tipo: 'CREADO',
        resumen: {
          movimiento: this.movementSummary(movimiento),
          detalle: {
            grossAmount: gross,
            retentionAmount: retention,
            netAmount: net,
          },
        },
      });

      return { movimiento, detalle };
    });
  }

  async createGasto(
    userId: string,
    data: CrearMovimientoInput,
    periodoId: string,
    fecha: Date,
  ): Promise<{ movimiento: Movimiento }> {
    if (this.normalizeObjetivoId(data.objetivoId)) {
      throw new AppError(ErrorCodes.VALIDATION_ERROR, {
        message: 'Solo los ingresos pueden aportar a un objetivo.',
        statusCode: 400,
      });
    }

    const expenseCategoryId = data.expenseCategoryId;
    if (!expenseCategoryId) {
      throw new AppError(ErrorCodes.VALIDATION_ERROR, {
        message: 'La categoría de gasto es obligatoria.',
        statusCode: 400,
      });
    }

    if (!data.expenseType || !['FIJO', 'VARIABLE'].includes(data.expenseType)) {
      throw new AppError(ErrorCodes.VALIDATION_ERROR, {
        message: 'El tipo de gasto debe ser FIJO o VARIABLE.',
        statusCode: 400,
      });
    }

    const categoria = await this.categoriaGastoRepository.findById(expenseCategoryId);
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
    if (isAmountTooLarge(amount)) {
      throw new AppError(ErrorCodes.AMOUNT_TOO_LARGE, {
        message: `El monto no puede superar Q ${MAX_AMOUNT_FORMATTED}.`,
        statusCode: 422,
      });
    }

    return withTransaction(async (client) => {
      const movimientoRepo = new MovimientoRepository(client);

      const stats = await movimientoRepo.getStatsByPeriodo(periodoId);
      const disponible = Number(stats.totalIngresos) - Number(stats.totalGastos);
      if (amount > disponible) {
        throw new AppError(ErrorCodes.INSUFFICIENT_FUNDS, {
          message: this.insufficientFundsMessage(disponible),
          statusCode: 422,
        });
      }

      await this.assertWithinCategoryAllocation(client, periodoId, expenseCategoryId, amount);

      const movimiento = await movimientoRepo.create({
        userId,
        periodoId,
        type: 'EXPENSE',
        expenseCategoryId,
        amount,
        description: data.description,
        expenseType: data.expenseType,
        date: fecha,
      });

      await this.logAuditoria(client, {
        movimientoId: movimiento.id,
        periodoId,
        userId,
        tipo: 'CREADO',
        resumen: {
          movimiento: this.movementSummary(movimiento),
        },
      });

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
      if (movimiento.objetivoId) {
        const esRetiro =
          movimiento.type === 'INCOME' && movimiento.incomeCategoryId === null;
        await this.adjustObjetivo(
          client,
          movimiento.objetivoId,
          esRetiro ? Number(movimiento.amount) : -Number(movimiento.amount),
        );
      }
      await this.logAuditoria(client, {
        movimientoId: movimiento.id,
        periodoId: movimiento.periodoId,
        userId,
        tipo: 'ELIMINADO',
        resumen: {
          movimiento: this.movementSummary(movimiento),
        },
      });
      });
  }

  async update(
    id: string,
    userId: string,
    data: {
      amount?: number;
      description?: string;
      date?: string;
      grossAmount?: number;
      retentionAmount?: number;
      taxTreatmentId?: string;
      incomeClassification?: IncomeClassification;
      expenseType?: ExpenseType;
      objetivoId?: string | null;
    },
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

    let fecha: Date | undefined;
    if (data.date !== undefined) {
      fecha = new Date(data.date);
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
      this.assertNotFutureDate(data.date);
    }

    const isInternalMovement =
      (movimiento.type === 'EXPENSE' && movimiento.objetivoId !== null) ||
      (movimiento.type === 'INCOME' &&
        movimiento.objetivoId !== null &&
        movimiento.incomeCategoryId === null);
    if (isInternalMovement) {
      throw new AppError(ErrorCodes.VALIDATION_ERROR, {
        message: 'Este movimiento es un aporte o retiro de objetivo y no puede editarse.',
        statusCode: 400,
      });
    }

    if (movimiento.type === 'INCOME') {
      return this.updateIngreso(movimiento, data, fecha);
    }
    return this.updateGasto(movimiento, data, fecha);
  }

  private async updateIngreso(
    movimiento: Movimiento,
    data: {
      amount?: number;
      description?: string;
      date?: string;
      grossAmount?: number;
      retentionAmount?: number;
      taxTreatmentId?: string;
      incomeClassification?: IncomeClassification;
      objetivoId?: string | null;
    },
    fecha: Date | undefined,
  ): Promise<Movimiento> {
    return withTransaction(async (client) => {
      const movimientoRepo = new MovimientoRepository(client);
      const detalleRepo = new DetalleIngresoRepository(client);
      const detalle = await detalleRepo.findById(movimiento.id);
      const oldObjetivoId = movimiento.objetivoId;
      const oldNet = Number(movimiento.amount);

      const objetivoId = data.objetivoId !== undefined
        ? this.normalizeObjetivoId(data.objetivoId)
        : movimiento.objetivoId;
      if (objetivoId) {
        await this.assertObjetivoElegible(objetivoId, movimiento.userId);
      }

      const gross = data.grossAmount ?? data.amount ?? Number(detalle?.grossAmount ?? 0);
      if (typeof gross !== 'number' || isNaN(gross) || gross <= 0) {
        throw new AppError(ErrorCodes.VALIDATION_ERROR, {
          message: 'El monto bruto debe ser un número mayor a 0.',
          statusCode: 400,
        });
      }
      if (isAmountTooLarge(gross)) {
        throw new AppError(ErrorCodes.AMOUNT_TOO_LARGE, {
          message: `El monto no puede superar Q ${MAX_AMOUNT_FORMATTED}.`,
          statusCode: 422,
        });
      }
      const retention = data.retentionAmount ?? Number(detalle?.retentionAmount ?? 0);
      if (retention < 0 || retention > gross) {
        throw new AppError(ErrorCodes.VALIDATION_ERROR, {
          message: 'La retención debe ser un valor entre 0 y el monto bruto.',
          statusCode: 400,
        });
      }
      const net = gross - retention;
      const taxTreatmentId =
        data.taxTreatmentId !== undefined ? data.taxTreatmentId : (detalle?.taxTreatmentId ?? null);

      if (!detalle) {
        throw new AppError(ErrorCodes.INTERNAL_ERROR, {
          message: 'El ingreso no tiene detalle fiscal asociado.',
          statusCode: 500,
        });
      }

      await detalleRepo.update(movimiento.id, {
        taxTreatmentId,
        grossAmount: gross,
        retentionAmount: retention,
        netAmount: net,
      });

      const payload: {
        amount: number;
        description?: string;
        incomeClassification?: IncomeClassification;
        objetivoId?: string | null;
        date?: Date;
      } = { amount: net, objetivoId };
      if (data.description !== undefined) {
        payload.description = data.description;
      }
      if (data.incomeClassification !== undefined) {
        if (!['REGULAR', 'OCASIONAL'].includes(data.incomeClassification)) {
          throw new AppError(ErrorCodes.VALIDATION_ERROR, {
            message: 'La clasificación del ingreso debe ser REGULAR u OCASIONAL.',
            statusCode: 400,
          });
        }
        payload.incomeClassification = data.incomeClassification;
      }
      if (fecha !== undefined) {
        payload.date = fecha;
      }

      const updated = await movimientoRepo.update(movimiento.id, payload);
      if (!updated) {
        throw new AppError(ErrorCodes.INTERNAL_ERROR, {
          message: 'Error al actualizar el movimiento.',
          statusCode: 500,
        });
      }

      if (objetivoId === oldObjetivoId) {
        if (objetivoId && net !== oldNet) {
          await this.adjustObjetivo(client, objetivoId, net - oldNet);
        }
      } else {
        if (oldObjetivoId) {
          await this.adjustObjetivo(client, oldObjetivoId, -oldNet);
        }
        if (objetivoId) {
          await this.adjustObjetivo(client, objetivoId, net);
        }
      }

      await this.logAuditoria(client, {
        movimientoId: movimiento.id,
        periodoId: movimiento.periodoId,
        userId: movimiento.userId,
        tipo: 'MODIFICADO',
        resumen: this.buildModifyResumen(movimiento, updated),
      });
      return updated;
    });
  }

  private async updateGasto(
    movimiento: Movimiento,
    data: {
      amount?: number;
      description?: string;
      date?: string;
      expenseType?: ExpenseType;
      objetivoId?: string | null;
    },
    fecha: Date | undefined,
  ): Promise<Movimiento> {
    if (this.normalizeObjetivoId(data.objetivoId)) {
      throw new AppError(ErrorCodes.VALIDATION_ERROR, {
        message: 'Solo los ingresos pueden aportar a un objetivo.',
        statusCode: 400,
      });
    }
    const payload: {
      amount?: number;
      description?: string;
      expenseType?: ExpenseType;
      date?: Date;
    } = {};
    if (data.amount !== undefined) {
      if (typeof data.amount !== 'number' || isNaN(data.amount) || data.amount <= 0) {
        throw new AppError(ErrorCodes.VALIDATION_ERROR, {
          message: 'El monto debe ser un número mayor a 0.',
          statusCode: 400,
        });
      }
      if (isAmountTooLarge(data.amount)) {
        throw new AppError(ErrorCodes.AMOUNT_TOO_LARGE, {
          message: `El monto no puede superar Q ${MAX_AMOUNT_FORMATTED}.`,
          statusCode: 422,
        });
      }
      payload.amount = data.amount;
    }
    if (data.description !== undefined) {
      payload.description = data.description;
    }
    if (data.expenseType !== undefined) {
      if (!['FIJO', 'VARIABLE'].includes(data.expenseType)) {
        throw new AppError(ErrorCodes.VALIDATION_ERROR, {
          message: 'El tipo de gasto debe ser FIJO o VARIABLE.',
          statusCode: 400,
        });
      }
      payload.expenseType = data.expenseType;
    }
    if (fecha !== undefined) {
      payload.date = fecha;
    }

    return withTransaction(async (client) => {
      const movimientoRepo = new MovimientoRepository(client);

      if (payload.amount !== undefined && payload.amount !== Number(movimiento.amount)) {
        const stats = await movimientoRepo.getStatsByPeriodo(movimiento.periodoId);
        const disponible =
          Number(stats.totalIngresos) - Number(stats.totalGastos) + Number(movimiento.amount);
        if (payload.amount > disponible) {
          throw new AppError(ErrorCodes.INSUFFICIENT_FUNDS, {
            message: this.insufficientFundsMessage(disponible),
            statusCode: 422,
          });
        }
        if (movimiento.expenseCategoryId) {
          await this.assertWithinCategoryAllocation(
            client,
            movimiento.periodoId,
            movimiento.expenseCategoryId,
            payload.amount,
            movimiento.id,
          );
        }
      }

      const updated = await movimientoRepo.update(movimiento.id, payload);
      if (!updated) {
        throw new AppError(ErrorCodes.INTERNAL_ERROR, {
          message: 'Error al actualizar el movimiento.',
          statusCode: 500,
        });
      }
      await this.logAuditoria(client, {
        movimientoId: movimiento.id,
        periodoId: movimiento.periodoId,
        userId: movimiento.userId,
        tipo: 'MODIFICADO',
        resumen: this.buildModifyResumen(movimiento, updated),
      });
      return updated;
    });
  }

  async getStats(userId: string, periodId?: string): Promise<{ totalIngresos: number; totalGastos: number }> {
    return this.movimientoRepository.getStats(userId, periodId);
  }

  private movementSummary(movement: Movimiento): Record<string, unknown> {
    if (movement.type === 'INCOME') {
      return {
        type: 'INCOME',
        amount: Number(movement.amount),
        description: movement.description ?? null,
        date: movement.date,
        incomeClassification: movement.incomeClassification ?? null,
        objetivoId: movement.objetivoId ?? null,
      };
    }
    return {
      type: 'EXPENSE',
      amount: Number(movement.amount),
      description: movement.description ?? null,
      date: movement.date,
      expenseType: movement.expenseType ?? null,
      objetivoId: movement.objetivoId ?? null,
    };
  }

  private buildModifyResumen(antes: Movimiento, despues: Movimiento): Record<string, unknown> {
    const antesSummary = this.movementSummary(antes);
    const despuesSummary = this.movementSummary(despues);
    const cambios: Record<string, [unknown, unknown]> = {};
    for (const key of Object.keys(despuesSummary)) {
      const a = antesSummary[key];
      const b = despuesSummary[key];
      if (String(a) !== String(b)) {
        cambios[key] = [a, b];
      }
    }
    return { antes: antesSummary, despues: despuesSummary, cambios };
  }

  private async logAuditoria(
    client: Db,
    entry: {
      movimientoId: string;
      periodoId: string;
      userId: string;
      tipo: MovimientoAuditoriaTipo;
      resumen: Record<string, unknown>;
    },
  ): Promise<void> {
    const auditoriaRepo = new MovimientoAuditoriaRepository(client);
    await auditoriaRepo.create(entry);
  }

  private normalizeObjetivoId(value: string | null | undefined): string | null {
    if (value === null || value === undefined) {
      return null;
    }
    const trimmed = String(value).trim();
    return trimmed || null;
  }

  private assertNotFutureDate(dateStr: string): void {
    if (dateStr.slice(0, 10) > this.todayLocalISO()) {
      throw new AppError(ErrorCodes.DATE_IN_FUTURE, {
        message: 'La fecha no puede ser posterior a hoy.',
        statusCode: 422,
      });
    }
  }

  private todayLocalISO(): string {
    const now = new Date();
    const y = now.getFullYear();
    const m = String(now.getMonth() + 1).padStart(2, '0');
    const d = String(now.getDate()).padStart(2, '0');
    return `${y}-${m}-${d}`;
  }

  private insufficientFundsMessage(disponible: number): string {
    const formatted = Number(disponible).toLocaleString('en-US', {
      minimumFractionDigits: 2,
      maximumFractionDigits: 2,
    });
    return `Fondos insuficientes. Los gastos del período no pueden superar el dinero disponible. Disponible: Q ${formatted}.`;
  }

  private async assertWithinCategoryAllocation(
    db: Db,
    periodoId: string,
    expenseCategoryId: string,
    amount: number,
    excludeMovementId?: string,
  ): Promise<void> {
    const presupuestoRepo = new PresupuestoRepository(db);
    const presupuesto = await presupuestoRepo.findByPeriodo(periodoId);
    if (!presupuesto) {
      return;
    }
    const asignacionRepo = new AsignacionPresupuestoRepository(db);
    const asignaciones = await asignacionRepo.findByPresupuesto(presupuesto.id);
    const asignacion = asignaciones.find((a) => a.categoriaGastoId === expenseCategoryId);
    if (!asignacion) {
      return;
    }
    const movimientoRepo = new MovimientoRepository(db);
    const consumido = await movimientoRepo.getExpenseTotalByCategory(
      periodoId,
      expenseCategoryId,
      excludeMovementId,
    );
    const remanente = Number(asignacion.amount) - consumido;
    if (amount > remanente) {
      const formatted = Number(remanente).toLocaleString('en-US', {
        minimumFractionDigits: 2,
        maximumFractionDigits: 2,
      });
      throw new AppError(ErrorCodes.EXPENSE_EXCEEDS_CATEGORY_ALLOCATION, {
        message: `El gasto supera el remanente asignado a la categoría. Remanente disponible: Q ${formatted}.`,
        statusCode: 422,
      });
    }
  }

  private async assertObjetivoElegible(objetivoId: string, userId: string): Promise<void> {
    const objetivoRepo = new ObjetivoRepository(pool);
    const objetivo = await objetivoRepo.findById(objetivoId);
    if (!objetivo) {
      throw new AppError(ErrorCodes.NOT_FOUND, {
        message: 'Objetivo no encontrado.',
        statusCode: 404,
      });
    }
    if (objetivo.userId !== userId) {
      throw new AppError(ErrorCodes.FORBIDDEN, {
        message: 'No tienes acceso a este objetivo.',
        statusCode: 403,
      });
    }
    if (objetivo.status !== 'ACTIVE') {
      throw new AppError(ErrorCodes.GOAL_NOT_ACTIVE, {
        message: 'Solo los objetivos activos aceptan aportes automáticos.',
        statusCode: 422,
      });
    }
  }

  private async adjustObjetivo(client: Db, objetivoId: string, delta: number): Promise<void> {
    const objetivoRepo = new ObjetivoRepository(client);
    const ajustado = await objetivoRepo.adjust(objetivoId, delta);
    if (!ajustado) {
      throw new AppError(ErrorCodes.INTERNAL_ERROR, {
        message: 'Error al actualizar el objetivo vinculado.',
        statusCode: 500,
      });
    }
  }
}
