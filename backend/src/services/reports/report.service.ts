import { Db, pool, PoolClient } from '../../config/db';
import { AppError } from '../../errors/app-error';
import { ErrorCodes } from '../../errors/error-codes';
import { Periodo } from '../../entities/periodo.entity';
import { MovimientoType } from '../../entities/movimiento.entity';
import { Objetivo } from '../../entities/objetivo.entity';
import { PeriodoRepository } from '../../repositories/periodo.repository';
import { MovimientoRepository } from '../../repositories/movimiento.repository';
import { PresupuestoRepository } from '../../repositories/presupuesto.repository';
import { AsignacionPresupuestoRepository } from '../../repositories/asignacion-presupuesto.repository';
import { ExcedentePresupuestoRepository } from '../../repositories/excedente-presupuesto.repository';
import { ObjetivoRepository } from '../../repositories/objetivo.repository';
import { SnapshotInformeRepository } from '../../repositories/snapshot-informe.repository';

export interface ReportCategoryRow {
  categoriaId: string | null;
  nombre: string;
  tipo: MovimientoType;
  total: number;
  presupuestado: number | null;
}

export interface ReportData {
  periodo: {
    id: string;
    name: string;
    startDate: Date;
    endDate: Date;
    status: string;
  };
  totalIngresos: number;
  totalGastos: number;
  disponible: number;
  presupuesto: {
    total: number;
    asignado: number;
    disponible: number;
    excedente: number;
  } | null;
  porCategoria: ReportCategoryRow[];
  objetivos: {
    id: string;
    name: string;
    currentAmount: number;
    targetAmount: number;
    progress: number;
    status: string;
  }[];
  recomendaciones: string[];
  generadoEn: Date;
}

export class ReportService {
  constructor(private readonly db: Db = pool) {}

  async generatePreliminary(periodoId: string, userId: string): Promise<ReportData> {
    const periodoRepo = new PeriodoRepository(this.db);
    const periodo = await periodoRepo.findById(periodoId);
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
    return this.computeReportData(periodo, userId);
  }

  async getFinal(periodoId: string, userId: string): Promise<{ reportData: unknown; generadoEn: Date }> {
    const periodoRepo = new PeriodoRepository(this.db);
    const periodo = await periodoRepo.findById(periodoId);
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
    if (periodo.status !== 'FINISHED') {
      throw new AppError(ErrorCodes.PERIOD_NOT_FINALIZED, {
        message: 'El informe final solo está disponible cuando el período está finalizado.',
        statusCode: 409,
      });
    }

    const snapshotRepo = new SnapshotInformeRepository(this.db);
    const snapshot = await snapshotRepo.findByPeriodo(periodoId);
    if (!snapshot) {
      throw new AppError(ErrorCodes.NOT_FOUND, {
        message: 'Aún no existe un informe final para este período.',
        statusCode: 404,
      });
    }

    return { reportData: snapshot.reportData, generadoEn: snapshot.generatedAt };
  }

  async generateAndSaveSnapshot(client: PoolClient, periodoId: string, userId: string): Promise<void> {
    const periodoRepo = new PeriodoRepository(client);
    const periodo = await periodoRepo.findById(periodoId);
    if (!periodo) {
      throw new AppError(ErrorCodes.NOT_FOUND, {
        message: 'Período no encontrado.',
        statusCode: 404,
      });
    }
    const reportData = await this.computeReportData(periodo, userId, client);
    const snapshotRepo = new SnapshotInformeRepository(client);
    await snapshotRepo.create({ periodoId, reportData });
  }

  private async computeReportData(
    periodo: Periodo,
    userId: string,
    db: Db = this.db,
  ): Promise<ReportData> {
    const movimientoRepo = new MovimientoRepository(db);
    const presupuestoRepo = new PresupuestoRepository(db);
    const asignacionRepo = new AsignacionPresupuestoRepository(db);
    const excedenteRepo = new ExcedentePresupuestoRepository(db);
    const objetivoRepo = new ObjetivoRepository(db);

    const stats = await movimientoRepo.getStatsByPeriodo(periodo.id);
    const totalIngresos = Number(stats.totalIngresos);
    const totalGastos = Number(stats.totalGastos);
    const disponible = totalIngresos - totalGastos;

    const porCategoriaBase = await movimientoRepo.getCategoryBreakdown(periodo.id);

    const presupuesto = await presupuestoRepo.findByPeriodo(periodo.id);
    let presupuestoInfo: ReportData['presupuesto'] = null;
    let excedente = 0;
    const asignacionPorCategoria: Record<string, number> = {};
    if (presupuesto) {
      const asignaciones = await asignacionRepo.findByPresupuesto(presupuesto.id);
      const asignado = asignaciones.reduce((s, a) => s + Number(a.amount), 0);
      excedente = await excedenteRepo.findTotalByPresupuesto(presupuesto.id);
      for (const asignacion of asignaciones) {
        asignacionPorCategoria[asignacion.categoriaGastoId] = Number(asignacion.amount);
      }
      presupuestoInfo = {
        total: totalIngresos,
        asignado,
        disponible: Math.max(0, totalIngresos - totalGastos),
        excedente: Number(excedente),
      };
    }

    const porCategoria: ReportCategoryRow[] = porCategoriaBase.map((row) => ({
      categoriaId: row.categoryId,
      nombre: row.nombre,
      tipo: row.type,
      total: row.total,
      presupuestado:
        row.type === 'EXPENSE' && row.categoryId !== null
          ? (asignacionPorCategoria[row.categoryId] ?? null)
          : null,
    }));

    const objetivos = await objetivoRepo.findForReport(userId, periodo.id);
    const objetivosInfo = objetivos.map((o: Objetivo) => ({
      id: o.id,
      name: o.name,
      currentAmount: o.currentAmount,
      targetAmount: o.targetAmount,
      progress: o.targetAmount > 0 ? Math.round((o.currentAmount / o.targetAmount) * 100) : 0,
      status: o.status,
    }));

    const recomendaciones = this.buildRecomendaciones({
      presupuesto: presupuestoInfo,
      excedente,
      disponible,
      objetivos: objetivosInfo,
    });

    return {
      periodo: {
        id: periodo.id,
        name: periodo.name,
        startDate: periodo.startDate,
        endDate: periodo.endDate,
        status: periodo.status,
      },
      totalIngresos,
      totalGastos,
      disponible,
      presupuesto: presupuestoInfo,
      porCategoria,
      objetivos: objetivosInfo,
      recomendaciones,
      generadoEn: new Date(),
    };
  }

  private buildRecomendaciones(params: {
    presupuesto: ReportData['presupuesto'];
    excedente: number;
    disponible: number;
    objetivos: ReportData['objetivos'];
  }): string[] {
    const recomendaciones: string[] = [];
    const fmt = (n: number): string =>
      'Q' + n.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });

    if (params.presupuesto) {
      if (params.excedente > 0) {
        recomendaciones.push(
          `Tus gastos superaron tu presupuesto por ${fmt(params.excedente)}. Revisa las categorías de gasto y ajusta tu presupuesto.`,
        );
      } else {
        recomendaciones.push(
          'Te mantienes dentro de tu presupuesto general. Sigue registrando tus gastos para mantener el control.',
        );
      }
    } else {
      recomendaciones.push(
        'Aún no has definido un presupuesto para este período. Defínelo para fijar un límite general de gasto.',
      );
    }

    const objetivosPendientes = params.objetivos.filter((o) => o.progress < 100);
    if (params.disponible > 0 && objetivosPendientes.length > 0) {
      recomendaciones.push('Considera apartar una parte de tu ingreso disponible para tus objetivos.');
    }
    if (params.objetivos.some((o) => o.progress >= 100)) {
      recomendaciones.push('Alcanzaste la meta de al menos un objetivo. ¡Buen manejo de tus finanzas personales!');
    }

    return recomendaciones;
  }
}