import { TestBed, ComponentFixture } from '@angular/core/testing';
import { provideZonelessChangeDetection } from '@angular/core';
import { Dashboard } from './dashboard';
import { SidebarService } from '../../../../core/services/sidebar.service';
import { PeriodoService } from '../../../../core/services/periodo.service';
import { DashboardService } from '../../../../core/services/dashboard.service';
import { DashboardData, Periodo } from '../../../../core/models/api.models';

const periodo: Periodo = {
  id: 'p-1',
  userId: 'u-1',
  name: 'Mayo 2026',
  startDate: '2026-05-01T00:00:00.000Z',
  endDate: '2026-05-31T23:59:59.999Z',
  status: 'ACTIVE',
  createdAt: '2026-05-01T00:00:00.000Z',
  updatedAt: '2026-05-01T00:00:00.000Z',
  deletedAt: null,
};

const baseData: DashboardData = {
  periodoActivo: {
    id: 'p-1',
    name: 'Mayo 2026',
    startDate: '2026-05-01T00:00:00.000Z',
    endDate: '2026-05-31T23:59:59.999Z',
  },
  totalIngresos: 5000,
  totalGastos: 4000,
  disponiblePorIngresos: 1000,
  presupuesto: {
    id: 'b-1',
    totalAmount: 5000,
    asignadoTotal: 3000,
    excedenteTotal: 0,
    excedentes: [],
    asignaciones: [],
  },
  disponiblePorPresupuesto: 1000,
  disponible: 1000,
  objetivos: [],
};

const conExcedentes: DashboardData = {
  ...baseData,
  presupuesto: {
    ...baseData.presupuesto!,
    excedenteTotal: 300,
    excedentes: [
      {
        id: 'o-1',
        presupuestoId: 'b-1',
        movimientoId: 'm-1',
        amount: 300,
        createdAt: '2026-05-10T12:00:00.000Z',
        movimiento: {
          id: 'm-1',
          date: '2026-05-10T00:00:00.000Z',
          amount: 2300,
          description: 'Compra de emergencia',
          categoriaId: 'c-1',
          categoriaNombre: 'Alimentación',
        },
      },
    ],
  },
};

type Mock<T> = { [K in keyof T]: ReturnType<typeof vi.fn> };

async function settle(): Promise<void> {
  for (let i = 0; i < 6; i++) {
    await Promise.resolve();
  }
  await new Promise<void>((resolve) => setTimeout(resolve, 0));
}

describe('Dashboard', () => {
  let fixture: ComponentFixture<Dashboard>;
  let sidebarService: Mock<SidebarService>;
  let periodoService: Mock<PeriodoService>;
  let dashboardService: Mock<DashboardService>;

  beforeEach(() => {
    sidebarService = { setDashboard: vi.fn() } as Mock<SidebarService>;
    periodoService = { list: vi.fn() } as Mock<PeriodoService>;
    dashboardService = { get: vi.fn() } as Mock<DashboardService>;

    TestBed.configureTestingModule({
      imports: [Dashboard],
      providers: [
        provideZonelessChangeDetection(),
        { provide: SidebarService, useValue: sidebarService },
        { provide: PeriodoService, useValue: periodoService },
        { provide: DashboardService, useValue: dashboardService },
      ],
    });

    fixture = TestBed.createComponent(Dashboard);
  });

  it('muestra el origen de los excedentes cuando existen', async () => {
    periodoService.list.mockResolvedValue([periodo]);
    dashboardService.get.mockResolvedValue(conExcedentes);

    fixture.detectChanges();
    await settle();
    fixture.detectChanges();

    expect(sidebarService.setDashboard).toHaveBeenCalled();
    expect(dashboardService.get).toHaveBeenCalledWith('p-1');
    const text = fixture.nativeElement.textContent;
    expect(text).toContain('EXCEDENTES (SOBREPRESUPUESTO) POR MOVIMIENTO');
    expect(text).toContain('Compra de emergencia');
    expect(text).toContain('Alimentación');
    expect(text).toContain('Q 300.00');
  });

  it('no muestra el panel de excedentes cuando no existen', async () => {
    periodoService.list.mockResolvedValue([periodo]);
    dashboardService.get.mockResolvedValue(baseData);

    fixture.detectChanges();
    await settle();
    fixture.detectChanges();

    const text = fixture.nativeElement.textContent;
    expect(text).not.toContain('EXCEDENTES (SOBREPRESUPUESTO) POR MOVIMIENTO');
    expect(text).toContain('BIENVENIDO NUEVAMENTE!');
  });
});