import { TestBed, ComponentFixture } from '@angular/core/testing';
import { provideZonelessChangeDetection } from '@angular/core';
import { DashboardReports } from './reports';
import { ReportService } from '../../../../core/services/report.service';
import { PeriodoService } from '../../../../core/services/periodo.service';
import { MovimientoService } from '../../../../core/services/movimiento.service';
import { CategoriaService } from '../../../../core/services/categoria.service';
import { SidebarService } from '../../../../core/services/sidebar.service';
import { Movimiento, Periodo, ReportData } from '../../../../core/models/api.models';

const periodoActivo: Periodo = {
  id: 'p-1',
  userId: 'u-1',
  name: 'Enero 2026',
  startDate: '2026-01-01T00:00:00.000Z',
  endDate: '2026-01-31T23:59:59.999Z',
  status: 'ACTIVE',
  createdAt: '2026-01-01T00:00:00.000Z',
  updatedAt: '2026-01-01T00:00:00.000Z',
  deletedAt: null,
};

const periodoFinalizado: Periodo = {
  ...periodoActivo,
  id: 'p-2',
  name: 'Diciembre 2025',
  status: 'FINISHED',
};

const reportePrevio: ReportData = {
  periodo: {
    id: 'p-1',
    name: 'Enero 2026',
    startDate: '2026-01-01T00:00:00.000Z',
    endDate: '2026-01-31T23:59:59.999Z',
    status: 'ACTIVE',
  },
  totalIngresos: 5000,
  totalGastos: 1500,
  disponible: 3500,
  presupuesto: { total: 5000, asignado: 2000, disponible: 3500, excedente: 0 },
  porCategoria: [
    { categoriaId: 'c-1', nombre: 'Alimentación', tipo: 'EXPENSE', total: 1500, presupuestado: 2000 },
    { categoriaId: null, nombre: '—', tipo: 'INCOME', total: 5000, presupuestado: null },
  ],
  objetivos: [
    { id: 'o-1', name: 'Computadora', currentAmount: 3000, targetAmount: 10000, progress: 30, status: 'ACTIVE' },
  ],
  recomendaciones: ['Considera apartar una parte de tu ingreso disponible para tus objetivos.'],
  generadoEn: '2026-01-05T00:00:00.000Z',
};

const reporteFinal: ReportData = {
  ...reportePrevio,
  periodo: { ...reportePrevio.periodo, id: 'p-2', name: 'Diciembre 2025', status: 'FINISHED' },
  generadoEn: '2025-12-31T23:59:59.000Z',
};

const movimiento: Movimiento = {
  id: 'm-1',
  userId: 'u-1',
  periodoId: 'p-1',
  type: 'EXPENSE',
  incomeCategoryId: null,
  expenseCategoryId: 'c-1',
  amount: 1500,
  description: 'Despensa',
  incomeClassification: null,
  expenseType: 'VARIABLE',
  date: '2026-01-10T00:00:00.000Z',
  createdAt: '2026-01-10T00:00:00.000Z',
  updatedAt: '2026-01-10T00:00:00.000Z',
  deletedAt: null,
};

type Mock<T> = { [K in keyof T]: ReturnType<typeof vi.fn> };

async function settle(): Promise<void> {
  for (let i = 0; i < 6; i++) {
    await Promise.resolve();
  }
  await new Promise<void>((resolve) => setTimeout(resolve, 0));
}

describe('DashboardReports', () => {
  let fixture: ComponentFixture<DashboardReports>;
  let component: DashboardReports;
  let reportService: Mock<ReportService>;
  let periodoService: Mock<PeriodoService>;
  let movimientoService: Mock<MovimientoService>;
  let categoriaService: Mock<CategoriaService>;
  let sidebarService: Mock<SidebarService>;

  beforeEach(() => {
    reportService = { getPreliminary: vi.fn(), getFinal: vi.fn() };
    periodoService = { list: vi.fn() } as Mock<PeriodoService>;
    movimientoService = { list: vi.fn(), stats: vi.fn() } as Mock<MovimientoService>;
    categoriaService = { listIncome: vi.fn(), listExpense: vi.fn() } as Mock<CategoriaService>;
    sidebarService = { setDashboard: vi.fn() } as Mock<SidebarService>;

    TestBed.configureTestingModule({
      imports: [DashboardReports],
      providers: [
        provideZonelessChangeDetection(),
        { provide: ReportService, useValue: reportService },
        { provide: PeriodoService, useValue: periodoService },
        { provide: MovimientoService, useValue: movimientoService },
        { provide: CategoriaService, useValue: categoriaService },
        { provide: SidebarService, useValue: sidebarService },
      ],
    });

    fixture = TestBed.createComponent(DashboardReports);
    component = fixture.componentInstance;
  });

  it('selecciona el período ACTIVE y consume el informe preliminar', async () => {
    periodoService.list.mockResolvedValue([periodoActivo, periodoFinalizado]);
    reportService.getPreliminary.mockResolvedValue(reportePrevio);
    movimientoService.list.mockResolvedValue([movimiento]);
    categoriaService.listIncome.mockResolvedValue([]);
    categoriaService.listExpense.mockResolvedValue([]);

    fixture.detectChanges();
    await settle();

    expect(sidebarService.setDashboard).toHaveBeenCalled();
    expect(component.selectedPeriodId).toBe('p-1');
    expect(reportService.getPreliminary).toHaveBeenCalledWith('p-1');
    expect(reportService.getFinal).not.toHaveBeenCalled();

    fixture.detectChanges();
    const text = fixture.nativeElement.textContent;
    expect(text).toContain('Enero 2026');
    expect(text).toContain('INFORME PRELIMINAR');
    expect(text).toContain('Q 5,000.00');
    expect(text).toContain('DESVIACIONES POR CATEGORÍA');
    expect(text).toContain('RECOMENDACIONES');
    expect(text).toContain('Considera apartar una parte de tu ingreso disponible para tus objetivos.');
  });

  it('muestra la clasificación/tipo del movimiento en la tabla', async () => {
    periodoService.list.mockResolvedValue([periodoActivo]);
    reportService.getPreliminary.mockResolvedValue(reportePrevio);
    movimientoService.list.mockResolvedValue([movimiento]);
    categoriaService.listIncome.mockResolvedValue([]);
    categoriaService.listExpense.mockResolvedValue([]);

    fixture.detectChanges();
    await settle();
    fixture.detectChanges();

    const text = fixture.nativeElement.textContent;
    expect(text).toContain('Variable');
    expect(text).toContain('MOVIMIENTOS DEL PERÍODO');
  });

  it('muestra la desviación por categoría y el progreso del objetivo', async () => {
    periodoService.list.mockResolvedValue([periodoActivo]);
    reportService.getPreliminary.mockResolvedValue(reportePrevio);
    movimientoService.list.mockResolvedValue([movimiento]);
    categoriaService.listIncome.mockResolvedValue([]);
    categoriaService.listExpense.mockResolvedValue([]);

    fixture.detectChanges();
    await settle();
    fixture.detectChanges();

    const text = fixture.nativeElement.textContent;
    expect(text).toContain('Alimentación');
    expect(text).toContain('Q 2,000.00');
    expect(text).toContain('Q -500.00');
    expect(text).toContain('Computadora');
    expect(text).toContain('30%');
    expect(text).toContain('Progreso calculado automáticamente por el sistema.');
  });

  it('al elegir un período finalizado consume el informe final histórico', async () => {
    periodoService.list.mockResolvedValue([periodoActivo, periodoFinalizado]);
    reportService.getFinal.mockResolvedValue({ report: reporteFinal, generadoEn: reporteFinal.generadoEn });
    movimientoService.list.mockResolvedValue([]);
    categoriaService.listIncome.mockResolvedValue([]);
    categoriaService.listExpense.mockResolvedValue([]);

    fixture.detectChanges();
    await settle();

    await component.onPeriodChange({ target: { value: 'p-2' } } as unknown as Event);
    await settle();

    expect(reportService.getFinal).toHaveBeenCalledWith('p-2');
    expect(component.reportType).toBe('FINAL');

    fixture.detectChanges();
    const text = fixture.nativeElement.textContent;
    expect(text).toContain('INFORME FINAL');
    expect(text).toContain('copia histórica del período');
  });

  it('muestra el estado vacío cuando no hay períodos', async () => {
    periodoService.list.mockResolvedValue([]);

    fixture.detectChanges();
    await settle();
    fixture.detectChanges();

    const text = fixture.nativeElement.textContent;
    expect(text).toContain('No hay períodos. Crea un período para generar un informe.');
    expect(reportService.getPreliminary).not.toHaveBeenCalled();
  });

  it('formatCurrency formatea en quetzales', () => {
    expect(component.formatCurrency(1234.56)).toBe('Q 1,234.56');
  });
});