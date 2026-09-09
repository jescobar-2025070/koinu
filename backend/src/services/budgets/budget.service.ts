import { Db, pool, withTransaction } from '../../config/db';
import { AppError } from '../../errors/app-error';
import { ErrorCodes } from '../../errors/error-codes';
import { Presupuesto } from '../../entities/presupuesto.entity';
import { AsignacionPresupuesto } from '../../entities/asignacion-presupuesto.entity';
import { ExcedentePresupuesto } from '../../entities/excedente-presupuesto.entity';
import { PeriodoService } from '../periods/periodo.service';
import { PresupuestoRepository } from '../../repositories/presupuesto.repository';
import { AsignacionPresupuestoRepository } from '../../repositories/asignacion-presupuesto.repository';
import { ExcedentePresupuestoRepository } from '../../repositories/excedente-presupuesto.repository';
import { CategoriaGastoRepository } from '../../repositories/categoria-gasto.repository';
import { MovimientoRepository } from '../../repositories/movimiento.repository';

export interface PresupuestoConAsignaciones {
  presupuesto: Presupuesto | null;
  asignaciones: AsignacionPresupuesto[];
  asignadoTotal: number;
  excedenteTotal: number;
}

export class BudgetService {
  private readonly periodoService: PeriodoService;
  private readonly presupuestoRepository: PresupuestoRepository;
  private readonly asignacionRepository: AsignacionPresupuestoRepository;
  private readonly excedenteRepository: ExcedentePresupuestoRepository;
  private readonly categoriaGastoRepository: CategoriaGastoRepository;
  private readonly movimientoRepository: MovimientoRepository;

  constructor() {
    this.periodoService = new PeriodoService();
    this.presupuestoRepository = new PresupuestoRepository(pool);
    this.asignacionRepository = new AsignacionPresupuestoRepository(pool);
    this.excedenteRepository = new ExcedentePresupuestoRepository(pool);
    this.categoriaGastoRepository = new CategoriaGastoRepository(pool);
    this.movimientoRepository = new MovimientoRepository(pool);
  }

  async getBudget(periodoId: string, userId: string): Promise<PresupuestoConAsignaciones> {
    await this.assertPeriodOwnership(periodoId, userId);

    let presupuesto = await this.presupuestoRepository.findByPeriodo(periodoId);
    const totalAmount = await this.netIncomeOf(periodoId);

    if (!presupuesto) {
      presupuesto = await this.presupuestoRepository.create({
        periodoId,
        totalAmount,
      });
    }
    presupuesto.totalAmount = totalAmount;

    const asignaciones = await this.asignacionRepository.findByPresupuesto(presupuesto.id);
    const asignadoTotal = asignaciones.reduce((sum, a) => sum + Number(a.amount), 0);
    const excedenteTotal = await this.excedenteRepository.findTotalByPresupuesto(presupuesto.id);

    return {
      presupuesto,
      asignaciones,
      asignadoTotal,
      excedenteTotal,
    };
  }

  private async netIncomeOf(periodoId: string): Promise<number> {
    const stats = await this.movimientoRepository.getStatsByPeriodo(periodoId);
    return Number(stats.totalIngresos);
  }

  async listAllocations(periodoId: string, userId: string): Promise<AsignacionPresupuesto[]> {
    const budget = await this.getBudget(periodoId, userId);
    if (!budget.presupuesto) {
      return [];
    }
    return budget.asignaciones;
  }

  async createAllocation(
    periodoId: string,
    userId: string,
    categoriaGastoId: string,
    amount: number,
  ): Promise<AsignacionPresupuesto> {
    await this.assertPeriodOwnership(periodoId, userId);

    if (typeof amount !== 'number' || isNaN(amount) || amount <= 0) {
      throw new AppError(ErrorCodes.VALIDATION_ERROR, {
        message: 'La asignación debe ser un número mayor a 0.',
        statusCode: 400,
      });
    }

    const presupuesto = await this.presupuestoRepository.findByPeriodo(periodoId);
    if (!presupuesto) {
      throw new AppError(ErrorCodes.BUDGET_NOT_FOUND, {
        message: 'Primero define un presupuesto para este período.',
        statusCode: 404,
      });
    }

    const categoria = await this.categoriaGastoRepository.findById(categoriaGastoId);
    if (!categoria || (categoria.userId !== null && categoria.userId !== userId)) {
      throw new AppError(ErrorCodes.FORBIDDEN, {
        message: 'Categoría de gasto no válida.',
        statusCode: 403,
      });
    }

    return withTransaction(async (client) => {
      const asignRepo = new AsignacionPresupuestoRepository(client);
      const existing = await asignRepo.findByPresupuesto(presupuesto.id);
      const existingForCategoria = existing.find((a) => a.categoriaGastoId === categoriaGastoId);
      const totalAsignado =
        existing.reduce((sum, a) => sum + Number(a.amount), 0) -
        (existingForCategoria ? Number(existingForCategoria.amount) : 0) +
        amount;

      const totalDisponible = await this.netIncomeOf(periodoId);
      if (totalAsignado > totalDisponible) {
        throw new AppError(ErrorCodes.BUDGET_ALLOCATION_EXCEEDS_TOTAL, {
          message: 'La suma de asignaciones no puede superar el presupuesto total.',
          statusCode: 422,
        });
      }

      return asignRepo.create({
        presupuestoId: presupuesto.id,
        categoriaGastoId,
        amount,
      });
    });
  }

  async updateAllocation(id: string, userId: string, amount: number): Promise<AsignacionPresupuesto> {
    if (typeof amount !== 'number' || isNaN(amount) || amount <= 0) {
      throw new AppError(ErrorCodes.VALIDATION_ERROR, {
        message: 'La asignación debe ser un número mayor a 0.',
        statusCode: 400,
      });
    }

    const asignacion = await this.asignacionRepository.findById(id);
    if (!asignacion) {
      throw new AppError(ErrorCodes.NOT_FOUND, {
        message: 'Asignación no encontrada.',
        statusCode: 404,
      });
    }

    const presupuesto = await this.presupuestoRepository.findById(asignacion.presupuestoId);
    if (!presupuesto) {
      throw new AppError(ErrorCodes.BUDGET_NOT_FOUND, {
        message: 'El presupuesto asociado no existe.',
        statusCode: 404,
      });
    }
    await this.assertPeriodOwnership(presupuesto.periodoId, userId);

    return withTransaction(async (client) => {
      const asignRepo = new AsignacionPresupuestoRepository(client);
      const todas = await asignRepo.findByPresupuesto(presupuesto.id);
      const total =
        todas.reduce((sum, a) => sum + Number(a.amount), 0) -
        Number(asignacion.amount) +
        amount;

      const totalDisponible = await this.netIncomeOf(presupuesto.periodoId);
      if (total > totalDisponible) {
        throw new AppError(ErrorCodes.BUDGET_ALLOCATION_EXCEEDS_TOTAL, {
          message: 'La suma de asignaciones no puede superar el presupuesto total.',
          statusCode: 422,
        });
      }

      const updated = await asignRepo.update(id, amount);
      if (!updated) {
        throw new AppError(ErrorCodes.INTERNAL_ERROR, {
          message: 'Error al actualizar la asignación.',
          statusCode: 500,
        });
      }
      return updated;
    });
  }

  async deleteAllocation(id: string, userId: string): Promise<void> {
    const asignacion = await this.asignacionRepository.findById(id);
    if (!asignacion) {
      throw new AppError(ErrorCodes.NOT_FOUND, {
        message: 'Asignación no encontrada.',
        statusCode: 404,
      });
    }

    const presupuesto = await this.presupuestoRepository.findById(asignacion.presupuestoId);
    if (!presupuesto) {
      throw new AppError(ErrorCodes.BUDGET_NOT_FOUND, {
        message: 'El presupuesto asociado no existe.',
        statusCode: 404,
      });
    }
    await this.assertPeriodOwnership(presupuesto.periodoId, userId);

    const deleted = await this.asignacionRepository.delete(id);
    if (!deleted) {
      throw new AppError(ErrorCodes.INTERNAL_ERROR, {
        message: 'Error al eliminar la asignación.',
        statusCode: 500,
      });
    }
  }

  async getOverruns(periodoId: string, userId: string): Promise<{
    excedenteTotal: number;
    excedentes: ExcedentePresupuesto[];
  }> {
    await this.assertPeriodOwnership(periodoId, userId);

    const presupuesto = await this.presupuestoRepository.findByPeriodo(periodoId);
    if (!presupuesto) {
      return { excedenteTotal: 0, excedentes: [] };
    }

    const excedentes = await this.excedenteRepository.findByPresupuesto(presupuesto.id);
    return {
      excedenteTotal: excedentes.reduce((sum, e) => sum + Number(e.amount), 0),
      excedentes,
    };
  }

  async recomputeOverrunsForPeriod(periodoId: string): Promise<void> {
    return this.recomputeOverruns(pool, periodoId);
  }

  async recomputeOverruns(db: Db, periodoId: string): Promise<void> {
    const presupuestoRepo = new PresupuestoRepository(db);
    const excedenteRepo = new ExcedentePresupuestoRepository(db);
    const movimientoRepo = new MovimientoRepository(db);

    const presupuesto = await presupuestoRepo.findByPeriodo(periodoId);
    if (!presupuesto) {
      return;
    }

    const stats = await movimientoRepo.getStatsByPeriodo(periodoId);
    const threshold = Number(stats.totalIngresos);
    const gastos = await movimientoRepo.findExpensesByPeriodo(periodoId);

    await excedenteRepo.deleteByPresupuesto(presupuesto.id);

    let running = 0;
    let prevOverrun = 0;
    for (const gasto of gastos) {
      running += Number(gasto.amount);
      const currentOverrun = Math.max(0, running - threshold);
      const incremento = currentOverrun - prevOverrun;
      prevOverrun = currentOverrun;
      if (incremento > 0) {
        await excedenteRepo.create({
          presupuestoId: presupuesto.id,
          movimientoId: gasto.id,
          amount: incremento,
        });
      }
    }
  }

  private async assertPeriodOwnership(periodoId: string, userId: string): Promise<void> {
    await this.periodoService.findById(periodoId, userId);
  }
}