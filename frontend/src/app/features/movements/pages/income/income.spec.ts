import { TestBed, ComponentFixture } from '@angular/core/testing';
import { provideZonelessChangeDetection } from '@angular/core';
import { MovementsIncome } from './income';
import { SidebarService } from '../../../../core/services/sidebar.service';
import { PeriodoService } from '../../../../core/services/periodo.service';
import { CategoriaService } from '../../../../core/services/categoria.service';
import { MovimientoService } from '../../../../core/services/movimiento.service';
import { TratamientoFiscalService } from '../../../../core/services/tratamiento-fiscal.service';
import { Categoria, Periodo, TratamientoFiscal } from '../../../../core/models/api.models';

const periodo: Periodo = {
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

const categoria: Categoria = {
  id: 'c-1',
  userId: null,
  name: 'Salario',
  isDefault: true,
  isActive: true,
  createdAt: '2026-01-01T00:00:00.000Z',
};

const tratamiento: TratamientoFiscal = {
  id: 't-1',
  name: 'Sin retención',
  rate: 0,
  isActive: true,
  createdAt: '2026-01-01T00:00:00.000Z',
};

type Mock<T> = { [K in keyof T]: ReturnType<typeof vi.fn> };

async function settle(): Promise<void> {
  for (let i = 0; i < 6; i++) {
    await Promise.resolve();
  }
  await new Promise<void>((resolve) => setTimeout(resolve, 0));
}

describe('MovementsIncome', () => {
  let fixture: ComponentFixture<MovementsIncome>;
  let component: MovementsIncome;
  let periodoService: Mock<PeriodoService>;
  let categoriaService: Mock<CategoriaService>;
  let movimientoService: Mock<MovimientoService>;
  let tratamientoFiscalService: Mock<TratamientoFiscalService>;
  let sidebarService: Mock<SidebarService>;

  beforeEach(() => {
    periodoService = { list: vi.fn() } as Mock<PeriodoService>;
    categoriaService = { listIncome: vi.fn() } as Mock<CategoriaService>;
    movimientoService = {
      create: vi.fn(),
      list: vi.fn(),
      getById: vi.fn(),
      update: vi.fn(),
      delete: vi.fn(),
      stats: vi.fn(),
    };
    tratamientoFiscalService = { list: vi.fn() } as Mock<TratamientoFiscalService>;
    sidebarService = { setMovements: vi.fn() } as Mock<SidebarService>;

    TestBed.configureTestingModule({
      imports: [MovementsIncome],
      providers: [
        provideZonelessChangeDetection(),
        { provide: SidebarService, useValue: sidebarService },
        { provide: PeriodoService, useValue: periodoService },
        { provide: CategoriaService, useValue: categoriaService },
        { provide: MovimientoService, useValue: movimientoService },
        { provide: TratamientoFiscalService, useValue: tratamientoFiscalService },
      ],
    });

    fixture = TestBed.createComponent(MovementsIncome);
    component = fixture.componentInstance;
  });

  it('muestra el selector de clasificación y envía la clasificación al crear', async () => {
    periodoService.list.mockResolvedValue([periodo]);
    categoriaService.listIncome.mockResolvedValue([categoria]);
    tratamientoFiscalService.list.mockResolvedValue([tratamiento]);
    movimientoService.create.mockResolvedValue({ movimiento: {} as never });

    fixture.detectChanges();
    await settle();
    fixture.detectChanges();

    const text = fixture.nativeElement.textContent;
    expect(text).toContain('CLASIFICACIÓN');
    expect(text).toContain('Regular');
    expect(text).toContain('Ocasional');
    expect(component.selectedClasificacion).toBe('REGULAR');

    component.selectedCategoriaId = 'c-1';
    component.monto = 2000;
    component.selectedClasificacion = 'OCASIONAL';
    await component.saveIncome();

    expect(movimientoService.create).toHaveBeenCalledWith(
      expect.objectContaining({ incomeClassification: 'OCASIONAL', type: 'INCOME', grossAmount: 2000 }),
    );
  });

  it('no envía clasificación vacía ni permite guardar sin monto', async () => {
    periodoService.list.mockResolvedValue([periodo]);
    categoriaService.listIncome.mockResolvedValue([categoria]);
    tratamientoFiscalService.list.mockResolvedValue([tratamiento]);

    fixture.detectChanges();
    await settle();

    await component.saveIncome();
    expect(movimientoService.create).not.toHaveBeenCalled();
    expect(component.saveMessage).toContain('Complete todos los campos obligatorios');
  });
});