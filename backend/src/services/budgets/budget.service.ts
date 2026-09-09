import { Db, pool, withTransaction } from '../../config/db';
import { AppError } from '../../errors/app-error';
import { ErrorCodes } from '../../errors/error-codes';
import { Presupuesto } from '../../entities/presupuesto.entity';
import { AsignacionPresupuesto } from '../../entities/asignacion-presupuesto.entity';
import { ExcedenteConMovimiento } from '../../entities/excedente-presupuesto.entity';
import { PeriodoService } from '../periods/periodo.service';
import { PresupuestoRepository } from '../../repositories/presupuesto.repository';
import { AsignacionPresupuestoRepository } from '../../repositories/asignacion-presupuesto.repository';
import { ExcedentePresupuestoRepository } from '../../repositories/excedente-presupuesto.repository';
import { CategoriaGastoRepository } from '../../repositories/categoria-gasto.repository';
import { MovimientoRepository } from '../../repositories/movimiento.repository';
import { CategoriaGasto } from '../../entities/categoria-gasto.entity';

export interface PresupuestoConAsignaciones {
  presupuesto: Presupuesto | null;
  asignaciones: AsignacionPresupuesto[];
  asignadoTotal: number;
  excedenteTotal: number;
}

export interface RedistribucionAjuste {
  id: string;
  categoriaGastoId: string;
  categoriaNombre: string;
  amountActual: number;
  amountPropuesto: number;
  delta: number;
}

export interface RedistribucionPropuesta {
  redistribuible: boolean;
  motivo?: 'SIN_PRESUPUESTO' | 'SIN_EXCEDENTE' | 'SIN_HOLGURA' | 'SIN_ASIGNACIONES';
  totalPresupuesto: number;
  asignadoTotal: number;
  excedenteTotal: number;
  holgura: number;
  montoARedistribuir: number;
  ajustes: RedistribucionAjuste[];
}

function round2(n: number): number {
  return Math.round((n + Number.EPSILON) * 100) / 100;
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

    const presupuesto = await this.presupuestoRepository.findByPeriodo(periodoId);
    if (presupuesto) {
      presupuesto.totalAmount = await this.netIncomeOf(periodoId);
    }

    const asignaciones = presupuesto
      ? await this.asignacionRepository.findByPresupuesto(presupuesto.id)
      : [];
    const asignadoTotal = asignaciones.reduce((sum, a) => sum + Number(a.amount), 0);
    const excedenteTotal = presupuesto
      ? await this.excedenteRepository.findTotalByPresupuesto(presupuesto.id)
      : 0;

    return {
      presupuesto,
      asignaciones,
      asignadoTotal,
      excedenteTotal,
    };
  }

  async syncBudget(periodoId: string, userId: string): Promise<Presupuesto> {
    await this.assertPeriodOwnership(periodoId, userId);

    const totalAmount = await this.netIncomeOf(periodoId);

    return withTransaction(async (client) => {
      const presupuestoRepo = new PresupuestoRepository(client);
      const existing = await presupuestoRepo.findByPeriodo(periodoId);
      if (existing) {
        const updated = await presupuestoRepo.update(existing.id, totalAmount);
        if (!updated) {
          throw new AppError(ErrorCodes.INTERNAL_ERROR, {
            message: 'Error al actualizar el presupuesto.',
            statusCode: 500,
          });
        }
        return updated;
      }

      try {
        return await presupuestoRepo.create({ periodoId, totalAmount });
      } catch (error) {
        const isDuplicate = typeof error === 'object' && error !== null && (error as any).code === '23505';
        if (!isDuplicate) {
          throw error;
        }
        const concurrent = await presupuestoRepo.findByPeriodo(periodoId);
        if (!concurrent) {
          throw error;
        }
        const updated = await presupuestoRepo.update(concurrent.id, totalAmount);
        if (!updated) {
          throw error;
        }
        return updated;
      }
    });
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
    excedentes: ExcedenteConMovimiento[];
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

  async getRedistributionProposal(
    periodoId: string,
    userId: string,
  ): Promise<RedistribucionPropuesta> {
    await this.assertPeriodOwnership(periodoId, userId);

    const presupuesto = await this.presupuestoRepository.findByPeriodo(periodoId);
    if (!presupuesto) {
      const totalPresupuesto = await this.netIncomeOf(periodoId);
      return {
        redistribuible: false,
        motivo: 'SIN_PRESUPUESTO',
        totalPresupuesto: round2(totalPresupuesto),
        asignadoTotal: 0,
        excedenteTotal: 0,
        holgura: round2(totalPresupuesto),
        montoARedistribuir: 0,
        ajustes: [],
      };
    }

    return this.buildRedistributionProposal(pool, presupuesto);
  }

  async applyRedistribution(
    periodoId: string,
    userId: string,
  ): Promise<RedistribucionPropuesta> {
    await this.assertPeriodOwnership(periodoId, userId);

    const presupuesto = await this.presupuestoRepository.findByPeriodo(periodoId);
    if (!presupuesto) {
      throw new AppError(ErrorCodes.BUDGET_NOT_FOUND, {
        message: 'Primero define un presupuesto para este período.',
        statusCode: 404,
      });
    }

    const inicial = await this.buildRedistributionProposal(pool, presupuesto);
    if (!inicial.redistribuible) {
      throw new AppError(ErrorCodes.BUDGET_REDISTRIBUTION_NOT_AVAILABLE, {
        message: 'No hay excedente que redistribuir o no hay holgura presupuestaria disponible.',
        statusCode: 422,
      });
    }

    return withTransaction(async (client) => {
      const presupuestoRepo = new PresupuestoRepository(client);
      const actual = await presupuestoRepo.findByPeriodo(periodoId);
      if (!actual) {
        throw new AppError(ErrorCodes.BUDGET_NOT_FOUND, {
          message: 'Primero define un presupuesto para este período.',
          statusCode: 404,
        });
      }

      const propuesta = await this.buildRedistributionProposal(client, actual);
      if (!propuesta.redistribuible) {
        throw new AppError(ErrorCodes.BUDGET_REDISTRIBUTION_NOT_AVAILABLE, {
          message: 'No hay excedente que redistribuir o no hay holgura presupuestaria disponible.',
          statusCode: 422,
        });
      }

      const asignRepo = new AsignacionPresupuestoRepository(client);
      for (const ajuste of propuesta.ajustes) {
        const updated = await asignRepo.update(ajuste.id, ajuste.amountPropuesto);
        if (!updated) {
          throw new AppError(ErrorCodes.INTERNAL_ERROR, {
            message: 'Error al redistribuir la asignación.',
            statusCode: 500,
          });
        }
      }

      return propuesta;
    });
  }

  private async buildRedistributionProposal(
    db: Db,
    presupuesto: Presupuesto,
  ): Promise<RedistribucionPropuesta> {
    const asignacionRepo = new AsignacionPresupuestoRepository(db);
    const excedenteRepo = new ExcedentePresupuestoRepository(db);
    const movimientoRepo = new MovimientoRepository(db);
    const categoriaRepo = new CategoriaGastoRepository(db);

    const asignaciones = await asignacionRepo.findByPresupuesto(presupuesto.id);
    const excedenteRows = await excedenteRepo.findByPresupuesto(presupuesto.id);
    const excedenteTotal = excedenteRows.reduce((sum, e) => sum + Number(e.amount), 0);
    const stats = await movimientoRepo.getStatsByPeriodo(presupuesto.periodoId);
    const totalPresupuesto = Number(stats.totalIngresos);

    const asignadoTotal = asignaciones.reduce((sum, a) => sum + Number(a.amount), 0);
    const holgura = round2(Math.max(0, totalPresupuesto - asignadoTotal));
    const montoARedistribuir = round2(Math.min(excedenteTotal, holgura));

    const redistribuible = excedenteTotal > 0 && holgura > 0 && asignaciones.length > 0;

    let ajustes: RedistribucionAjuste[] = [];
    if (redistribuible) {
      const totalCents = Math.round(montoARedistribuir * 100);
      const pesosCents = asignaciones.map((a) => Math.round(Number(a.amount) * 100));
      const pesoTotal = pesosCents.reduce((sum, p) => sum + p, 0);
      const brutos = pesosCents.map((p) => (totalCents * p) / pesoTotal);
      const deltaCents = brutos.map((x) => Math.floor(x));
      let resto = totalCents - deltaCents.reduce((sum, x) => sum + x, 0);
      if (resto > 0) {
        const orden = brutos
          .map((x, i) => ({ i, frac: x - Math.floor(x) }))
          .sort((a, b) => b.frac - a.frac || a.i - b.i);
        for (let k = 0; k < resto; k += 1) {
          deltaCents[orden[k].i] += 1;
        }
      }

      const categorias = await Promise.all(
        asignaciones.map((a) => categoriaRepo.findById(a.categoriaGastoId)),
      );
      const nombrePorCategoria = new Map<string, string>(
        categorias
          .filter((c): c is CategoriaGasto => c !== null)
          .map((c) => [c.id, c.name]),
      );

      ajustes = asignaciones.map((a, i) => {
        const amountActual = round2(Number(a.amount));
        const delta = round2(deltaCents[i] / 100);
        return {
          id: a.id,
          categoriaGastoId: a.categoriaGastoId,
          categoriaNombre: nombrePorCategoria.get(a.categoriaGastoId) ?? '—',
          amountActual,
          amountPropuesto: round2(amountActual + delta),
          delta,
        };
      });
    }

    return {
      redistribuible,
      motivo: redistribuible
        ? undefined
        : excedenteTotal <= 0
          ? 'SIN_EXCEDENTE'
          : holgura <= 0
            ? 'SIN_HOLGURA'
            : 'SIN_ASIGNACIONES',
      totalPresupuesto: round2(totalPresupuesto),
      asignadoTotal: round2(asignadoTotal),
      excedenteTotal: round2(excedenteTotal),
      holgura,
      montoARedistribuir,
      ajustes,
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