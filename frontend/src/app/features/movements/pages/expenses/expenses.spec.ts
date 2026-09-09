import { TestBed, ComponentFixture } from '@angular/core/testing';
import { provideZonelessChangeDetection } from '@angular/core';
import { MovementsExpenses } from './expenses';
import { SidebarService } from '../../../../core/services/sidebar.service';
import { PeriodoService } from '../../../../core/services/periodo.service';
import { CategoriaService } from '../../../../core/services/categoria.service';
import { MovimientoService } from '../../../../core/services/movimiento.service';
import { Categoria, Periodo } from '../../../../core/models/api.models';

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
  name: 'Alimentación',
  isDefault: true,
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

describe('MovementsExpenses', () => {
  let fixture: ComponentFixture<MovementsExpenses>;
  let component: MovementsExpenses;
  let periodoService: Mock<PeriodoService>;
  let categoriaService: Mock<CategoriaService>;
  let movimientoService: Mock<MovimientoService>;
  let sidebarService: Mock<SidebarService>;

  beforeEach(() => {
    periodoService = { list: vi.fn() } as Mock<PeriodoService>;
    categoriaService = { listExpense: vi.fn() } as Mock<CategoriaService>;
    movimientoService = {
      create: vi.fn(),
      list: vi.fn(),
      getById: vi.fn(),
      update: vi.fn(),
      delete: vi.fn(),
      stats: vi.fn(),
    };
    sidebarService = { setMovements: vi.fn() } as Mock<SidebarService>;

    TestBed.configureTestingModule({
      imports: [MovementsExpenses],
      providers: [
        provideZonelessChangeDetection(),
        { provide: SidebarService, useValue: sidebarService },
        { provide: PeriodoService, useValue: periodoService },
        { provide: CategoriaService, useValue: categoriaService },
        { provide: MovimientoService, useValue: movimientoService },
      ],
    });

    fixture = TestBed.createComponent(MovementsExpenses);
    component = fixture.componentInstance;
  });

  it('muestra el selector de tipo de gasto y lo envía al crear', async () => {
    periodoService.list.mockResolvedValue([periodo]);
    categoriaService.listExpense.mockResolvedValue([categoria]);
    movimientoService.create.mockResolvedValue({ movimiento: {} as never });

    fixture.detectChanges();
    await settle();
    fixture.detectChanges();

    const text = fixture.nativeElement.textContent;
    expect(text).toContain('TIPO DE GASTO');
    expect(text).toContain('Fijo');
    expect(text).toContain('Variable');
    expect(component.selectedTipo).toBe('VARIABLE');

    component.selectedCategoriaId = 'c-1';
    component.monto = 500;
    component.selectedTipo = 'FIJO';
    await component.saveExpense();

    expect(movimientoService.create).toHaveBeenCalledWith(
      expect.objectContaining({ expenseType: 'FIJO', type: 'EXPENSE', amount: 500 }),
    );
  });

  it('no permite guardar sin monto ni categoría', async () => {
    periodoService.list.mockResolvedValue([periodo]);
    categoriaService.listExpense.mockResolvedValue([categoria]);

    fixture.detectChanges();
    await settle();

    await component.saveExpense();
    expect(movimientoService.create).not.toHaveBeenCalled();
    expect(component.saveMessage).toContain('Complete todos los campos obligatorios');
  });
});