import { ChangeDetectorRef, Component, inject, OnInit } from '@angular/core';
import { SidebarService } from '../../../../core/services/sidebar.service';
import { MovimientoService } from '../../../../core/services/movimiento.service';
import { PeriodoService } from '../../../../core/services/periodo.service';
import { CategoriaService } from '../../../../core/services/categoria.service';
import { ReportService } from '../../../../core/services/report.service';
import {
  Categoria,
  Movimiento,
  Periodo,
  ReportCategoryRow,
  ReportData,
} from '../../../../core/models/api.models';

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
  private readonly cdr = inject(ChangeDetectorRef);

  periodos: Periodo[] = [];
  selectedPeriodId: string | undefined;
  activePeriodName = '—';
  report: ReportData | null = null;
  reportType: 'PRELIMINAR' | 'FINAL' = 'PRELIMINAR';
  generadoEn = '';
  movements: Movimiento[] = [];
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
      const [movimientos, ingresos, gastos] = await Promise.all([
        this.movimientoService.list(this.selectedPeriodId),
        this.categoriaService.listIncome(),
        this.categoriaService.listExpense(),
      ]);
      this.categories = [...ingresos, ...gastos];
      this.movements = movimientos;
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

  get presupuestoExcedente(): number {
    return this.report?.presupuesto?.excedente ?? 0;
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

  deviationAmount(row: ReportCategoryRow): number | null {
    if (row.presupuestado === null) {
      return null;
    }
    return row.total - row.presupuestado;
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

  exportCsv(): void {
    const headers = ['Fecha', 'Tipo', 'Categoría', 'Descripción', 'Monto'];
    const rows = this.movements.map((m) => [
      this.formatDate(m.date),
      m.type === 'INCOME' ? 'Ingreso' : 'Gasto',
      this.getCategoryName(m.type === 'INCOME' ? m.incomeCategoryId : m.expenseCategoryId),
      m.description ?? '',
      m.amount.toFixed(2),
    ]);

    const csv = [headers, ...rows]
      .map((row) => row.map((cell) => `"${String(cell).replace(/"/g, '""')}"`).join(','))
      .join('\n');

    const blob = new Blob(['\uFEFF' + csv], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    const period = this.activePeriodName !== '—' ? this.activePeriodName.replace(/\s+/g, '_') : 'general';
    a.href = url;
    a.download = `informe_${period}.csv`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  }
}