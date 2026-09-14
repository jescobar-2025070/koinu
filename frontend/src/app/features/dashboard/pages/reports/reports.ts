import { ChangeDetectorRef, Component, inject, OnInit } from '@angular/core';
import { SidebarService } from '../../../../core/services/sidebar.service';
import { MovimientoService } from '../../../../core/services/movimiento.service';
import { PeriodoService } from '../../../../core/services/periodo.service';
import { CategoriaService } from '../../../../core/services/categoria.service';
import { ReportService } from '../../../../core/services/report.service';
import { AuditService } from '../../../../core/services/audit.service';
import {
  Categoria,
  Movimiento,
  MovimientoAuditoria,
  Periodo,
  ReportCategoryRow,
  ReportData,
} from '../../../../core/models/api.models';

interface MovementRow {
  id: string;
  date: string;
  type: Movimiento['type'];
  categoryName: string;
  classification: string;
  description: string | null;
  amount: number;
  evento: 'CREADO' | 'MODIFICADO' | 'ELIMINADO';
  detalle: string;
  deleted: boolean;
}

@Component({
  selector: 'app-dashboard-reports',
  templateUrl: './reports.html',
  styleUrl: './reports.css',
})
export class DashboardReports implements OnInit {
  private readonly sidebarService = inject(SidebarService);
  private readonly movimientoService = inject(MovimientoService);
  private readonly periodoService = inject(PeriodoService);
  private readonly categoriaService = inject(CategoriaService);
  private readonly reportService = inject(ReportService);
  private readonly auditService = inject(AuditService);
  private readonly cdr = inject(ChangeDetectorRef);

  periodos: Periodo[] = [];
  selectedPeriodId: string | undefined;
  activePeriodName = '—';
  report: ReportData | null = null;
  reportType: 'PRELIMINAR' | 'FINAL' = 'PRELIMINAR';
  generadoEn = '';
  movements: Movimiento[] = [];
  auditoria: MovimientoAuditoria[] = [];
  exportMsg = '';
  private categories: Categoria[] = [];

  ngOnInit(): void {
    this.sidebarService.setDashboard();
    this.loadData();
  }

  private async loadData(): Promise<void> {
    try {
      const periodos = await this.periodoService.list();
      this.periodos = periodos;
      const activePeriod = periodos.find((p) => p.status === 'ACTIVE');
      this.selectedPeriodId = activePeriod?.id ?? periodos[0]?.id;
      await this.loadSelected();
    } catch (e) {
      console.error('Error loading reports:', e);
    }
  }

  async onPeriodChange(event: Event): Promise<void> {
    const id = (event.target as HTMLSelectElement).value;
    if (!id) {
      return;
    }
    this.selectedPeriodId = id;
    await this.loadSelected();
  }

  private async loadSelected(): Promise<void> {
    if (!this.selectedPeriodId) {
      this.report = null;
      this.movements = [];
      this.auditoria = [];
      this.cdr.markForCheck();
      return;
    }

    const periodo = this.periodos.find((p) => p.id === this.selectedPeriodId);
    this.activePeriodName = periodo?.name ?? '—';

    try {
      let report: ReportData;
      let generadoEn = '';
      if (periodo?.status === 'FINISHED') {
        this.reportType = 'FINAL';
        const historico = await this.reportService.getFinal(this.selectedPeriodId);
        report = historico.report;
        generadoEn = historico.generadoEn;
      } else {
        this.reportType = 'PRELIMINAR';
        report = await this.reportService.getPreliminary(this.selectedPeriodId);
        generadoEn = report.generadoEn;
      }
      this.report = report;
      this.generadoEn = generadoEn;
    } catch (e) {
      try {
        this.reportType = 'PRELIMINAR';
        this.report = await this.reportService.getPreliminary(this.selectedPeriodId);
        this.generadoEn = this.report.generadoEn;
      } catch (e2) {
        console.error('Error loading report:', e);
        this.report = null;
        this.generadoEn = '';
      }
    }

    try {
      const [movimientos, ingresos, gastos, auditoria] = await Promise.all([
        this.movimientoService.list(this.selectedPeriodId),
        this.categoriaService.listIncome(),
        this.categoriaService.listExpense(),
        this.auditService.getMovementsAudit(this.selectedPeriodId).catch(() => []),
      ]);
      this.categories = [...ingresos, ...gastos];
      this.movements = movimientos;
      this.auditoria = auditoria;
    } catch (e) {
      console.error('Error loading movements:', e);
    }
    this.cdr.markForCheck();
  }

  get presupuestoTotal(): number {
    return this.report?.presupuesto?.total ?? 0;
  }

  get presupuestoAsignado(): number {
    return this.report?.presupuesto?.asignado ?? 0;
  }

  get expenseRows(): ReportCategoryRow[] {
    return this.report?.porCategoria.filter((r) => r.tipo === 'EXPENSE') ?? [];
  }

  get recomendaciones(): string[] {
    return this.report?.recomendaciones ?? [];
  }

  get objetivos(): ReportData['objetivos'] {
    return this.report?.objetivos ?? [];
  }

  get disponibleDisplay(): number {
    return Math.max(0, this.report?.disponible ?? 0);
  }

  get movementRows(): MovementRow[] {
    if (this.movements.length === 0 && this.auditoria.length === 0) {
      return [];
    }

    const auditByMovimiento = new Map<string, MovimientoAuditoria[]>();
    for (const entry of this.auditoria) {
      const list = auditByMovimiento.get(entry.movimientoId) ?? [];
      list.push(entry);
      auditByMovimiento.set(entry.movimientoId, list);
    }

    const rows: MovementRow[] = [];

    for (const movement of this.movements) {
      const events = (auditByMovimiento.get(movement.id) ?? []).sort(
        (a, b) => Date.parse(b.createdAt) - Date.parse(a.createdAt),
      );
      const lastMod = events.find((e) => e.tipo === 'MODIFICADO');
      rows.push({
        id: movement.id,
        date: movement.date,
        type: movement.type,
        categoryName: this.getCategoryName(
          movement.type === 'INCOME' ? movement.incomeCategoryId : movement.expenseCategoryId,
        ),
        classification: movement.type === 'INCOME'
          ? (movement.incomeClassification === 'OCASIONAL' ? 'Ocasional' : 'Regular')
          : (movement.expenseType === 'FIJO' ? 'Fijo' : 'Variable'),
        description: movement.description,
        amount: Number(movement.amount),
        evento: lastMod ? 'MODIFICADO' : 'CREADO',
        detalle: lastMod ? this.auditoriaCambios(lastMod.resumen) : '—',
        deleted: false,
      });
    }

    const activeIds = new Set(this.movements.map((m) => m.id));
    for (const entry of this.auditoria) {
      if (entry.tipo !== 'ELIMINADO' || activeIds.has(entry.movimientoId)) {
        continue;
      }
      const resumen = entry.resumen.movimiento;
      if (!resumen) {
        continue;
      }
      const events = (auditByMovimiento.get(entry.movimientoId) ?? []).sort(
        (a, b) => Date.parse(b.createdAt) - Date.parse(a.createdAt),
      );
      const lastMod = events.find((e) => e.tipo === 'MODIFICADO');
      rows.push({
        id: entry.movimientoId,
        date: resumen.date,
        type: resumen.type,
        categoryName: '—',
        classification: resumen.type === 'INCOME'
          ? (resumen.incomeClassification === 'OCASIONAL' ? 'Ocasional' : 'Regular')
          : (resumen.expenseType === 'FIJO' ? 'Fijo' : 'Variable'),
        description: resumen.description,
        amount: Number(resumen.amount),
        evento: 'ELIMINADO',
        detalle: lastMod ? this.auditoriaCambios(lastMod.resumen) : '—',
        deleted: true,
      });
    }

    return rows.sort((a, b) => Date.parse(b.date) - Date.parse(a.date));
  }

  deviationAmount(row: ReportCategoryRow): number | null {
    if (row.presupuestado === null) {
      return null;
    }
    return row.total - row.presupuestado;
  }

  deviationDisplay(row: ReportCategoryRow): number | null {
    const deviation = this.deviationAmount(row);
    return deviation === null ? null : Math.abs(deviation);
  }

  deviationLabel(row: ReportCategoryRow): string | null {
    const deviation = this.deviationAmount(row);
    if (deviation === null) {
      return null;
    }
    return deviation > 0 ? 'EXCEDENTE' : 'SOBRANTE';
  }

  progressWidth(progress: number): number {
    return Math.min(100, progress);
  }

  objetivoStatusLabel(status: string): string {
    switch (status) {
      case 'COMPLETED':
        return 'COMPLETADO';
      case 'CANCELLED':
        return 'CANCELADO';
      default:
        return 'ACTIVO';
    }
  }

  getCategoryName(id: string | null): string {
    return this.categories.find((c) => c.id === id)?.name ?? '—';
  }

  formatCurrency(amount: number): string {
    return 'Q ' + amount.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  }

  formatDate(dateStr: string): string {
    const d = new Date(dateStr);
    return `${String(d.getDate()).padStart(2, '0')}/${String(d.getMonth() + 1).padStart(2, '0')}/${d.getFullYear()}`;
  }

  auditoriaCambios(resumen: MovimientoAuditoria['resumen']): string {
    const cambios = resumen?.cambios;
    if (!cambios) {
      return '—';
    }
    return Object.entries(cambios)
      .map(([field, [antes, despues]]) => {
        const formatear = (v: unknown): string => (v === null || v === undefined ? '—' : String(v));
        return `${field}: ${formatear(antes)} → ${formatear(despues)}`;
      })
      .join(', ');
  }

  async exportCsv(): Promise<void> {
    if (this.movements.length === 0) {
      return;
    }
    try {
      const headers = ['Fecha', 'Tipo', 'Categoría', 'Clasificación', 'Descripción', 'Monto'];
      const rows = this.movements.map((m) => [
        this.formatDate(m.date),
        m.type === 'INCOME' ? 'Ingreso' : 'Gasto',
        this.getCategoryName(m.type === 'INCOME' ? m.incomeCategoryId : m.expenseCategoryId),
        m.type === 'INCOME'
          ? (m.incomeClassification === 'OCASIONAL' ? 'Ocasional' : 'Regular')
          : (m.expenseType === 'FIJO' ? 'Fijo' : 'Variable'),
        m.description ?? '',
        Number(m.amount).toFixed(2),
      ]);

      const csv = [headers, ...rows]
        .map((row) => row.map((cell) => `"${String(cell).replace(/"/g, '""')}"`).join(','))
        .join('\n');

      const blob = new Blob(['\uFEFF' + csv], { type: 'text/csv;charset=utf-8;' });
      const period = this.activePeriodName !== '—' ? this.activePeriodName.replace(/\s+/g, '_') : 'general';
      const filename = `informe_${period}.csv`;

      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = filename;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      setTimeout(() => URL.revokeObjectURL(url), 1000);
      this.exportMsg = 'Reporte exportado correctamente.';
    } catch (e) {
      console.error('Error al exportar CSV:', e);
      this.exportMsg = 'No se pudo exportar el reporte.';
    }
    this.cdr.markForCheck();
  }
}