import { TestBed, ComponentFixture } from '@angular/core/testing';
import { provideZonelessChangeDetection } from '@angular/core';
import { ObjectivesBudget } from './budget';
import { BudgetService } from '../../../../core/services/budget.service';
import { PeriodoService } from '../../../../core/services/periodo.service';
import { CategoriaService } from '../../../../core/services/categoria.service';
import { SidebarService } from '../../../../core/services/sidebar.service';
import {
  AsignacionPresupuesto,
  BudgetData,
  Categoria,
  OverrunsData,
  Periodo,
} from '../../../../core/models/api.models';

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

const budgetData: BudgetData = {
  presupuesto: {
    id: 'b-1',
    periodoId: 'p-1',
    totalAmount: 5000,
    createdAt: '2026-01-02T00:00:00.000Z',
    updatedAt: '2026-01-02T00:00:00.000Z',
  },
  asignaciones: [
    { id: 'a-1', presupuestoId: 'b-1', categoriaGastoId: 'c-1', amount: 2000, createdAt: '2026-01-02T00:00:00.000Z' } as AsignacionPresupuesto,
  ],
  asignadoTotal: 2000,
  excedenteTotal: 0,
};

const noBudget: BudgetData = {
  presupuesto: null,
  asignaciones: [],
  asignadoTotal: 0,
  excedenteTotal: 0,
};

type Mock<T> = { [K in keyof T]: ReturnType<typeof vi.fn> };

async function settle(): Promise<void> {
  for (let i = 0; i < 6; i++) {
    await Promise.resolve();
  }
  await new Promise<void>((resolve) => setTimeout(resolve, 0));
}

const overruns: OverrunsData = {
  excedenteTotal: 300,
  excedentes: [
    {
      id: 'o-1',
      presupuestoId: 'b-1',
      movimientoId: 'm-1',
      amount: 300,
      createdAt: '2026-01-10T12:00:00.000Z',
    },
  ],
};

describe('ObjectivesBudget', () => {
  let fixture: ComponentFixture<ObjectivesBudget>;
  let component: ObjectivesBudget;
  let budgetService: Mock<BudgetService>;
  let periodoService: Mock<PeriodoService>;
  let categoriaService: Mock<CategoriaService>;
  let sidebarService: Mock<SidebarService>;

  beforeEach(() => {
    budgetService = {
      getBudget: vi.fn(),
      createBudget: vi.fn(),
      createAllocation: vi.fn(),
      updateAllocation: vi.fn(),
      deleteAllocation: vi.fn(),
      getOverruns: vi.fn(),
    };
    periodoService = { list: vi.fn() } as Mock<PeriodoService>;
    categoriaService = { listExpense: vi.fn() } as Mock<CategoriaService>;
    sidebarService = { setObjectives: vi.fn() } as Mock<SidebarService>;

    TestBed.configureTestingModule({
      imports: [ObjectivesBudget],
      providers: [
        provideZonelessChangeDetection(),
        { provide: BudgetService, useValue: budgetService },
        { provide: PeriodoService, useValue: periodoService },
        { provide: CategoriaService, useValue: categoriaService },
        { provide: SidebarService, useValue: sidebarService },
      ],
    });

    fixture = TestBed.createComponent(ObjectivesBudget);
    component = fixture.componentInstance;
  });

  it('carga períodos, activa el período ACTIVE y renderiza el total calculado', async () => {
    periodoService.list.mockResolvedValue([periodo]);
    categoriaService.listExpense.mockResolvedValue([categoria]);
    budgetService.createBudget.mockResolvedValue({ ...budgetData.presupuesto! });
    budgetService.getBudget.mockResolvedValue(budgetData);
    budgetService.getOverruns.mockResolvedValue({ excedenteTotal: 0, excedentes: [] });

    fixture.detectChanges();
    await settle();

    expect(component.periodos).toEqual([periodo]);
    expect(component.selectedPeriodId).toBe('p-1');
    expect(component.budget).toEqual(budgetData);
    expect(sidebarService.setObjectives).toHaveBeenCalled();
    expect(budgetService.createBudget).toHaveBeenCalledWith('p-1');
    expect(budgetService.getBudget).toHaveBeenCalledWith('p-1');

    fixture.detectChanges();
    const text = fixture.nativeElement.textContent;
    expect(text).toContain('Enero 2026');
    expect(text).toContain('Q 5,000.00');
    expect(text).toContain('Total (ingresos netos):');
  });

  it('no ofrece edición del total del presupuesto', async () => {
    periodoService.list.mockResolvedValue([periodo]);
    categoriaService.listExpense.mockResolvedValue([categoria]);
    budgetService.createBudget.mockResolvedValue({ ...budgetData.presupuesto! });
    budgetService.getBudget.mockResolvedValue(budgetData);
    budgetService.getOverruns.mockResolvedValue({ excedenteTotal: 0, excedentes: [] });

    fixture.detectChanges();
    await settle();
    fixture.detectChanges();

    const text = fixture.nativeElement.textContent;
    expect(text).not.toContain('Actualizar Presupuesto');
    expect(text).not.toContain('Definir Presupuesto');
    expect(budgetService.createAllocation).not.toHaveBeenCalled();
  });

  it('muestra el mensaje vacío cuando no hay períodos', async () => {
    periodoService.list.mockResolvedValue([]);

    fixture.detectChanges();
    await settle();
    fixture.detectChanges();

    const text = fixture.nativeElement.textContent;
    expect(text).toContain('Primero crea un período para asignar un presupuesto.');
    expect(budgetService.getBudget).not.toHaveBeenCalled();
  });

  it('isActivePeriod es true para ACTIVE y DRAFT, false para FINISHED', () => {
    component.periodos = [periodo];
    component.selectedPeriodId = 'p-1';
    expect(component.isActivePeriod()).toBe(true);

    component.periodos = [
      { ...periodo, id: 'p-2', status: 'DRAFT' },
      { ...periodo, id: 'p-3', status: 'FINISHED' },
    ];
    component.selectedPeriodId = 'p-2';
    expect(component.isActivePeriod()).toBe(true);

    component.selectedPeriodId = 'p-3';
    expect(component.isActivePeriod()).toBe(false);
  });

  it('addAllocation valida categoría y monto antes de llamar al servicio', async () => {
    component.selectedPeriodId = 'p-1';
    component.allocationCategoryId = '';
    component.allocationAmount = 0;

    await component.addAllocation();

    expect(budgetService.createAllocation).not.toHaveBeenCalled();
    expect(component.allocationMsg).toContain('Selecciona una categoría');
  });

  it('addAllocation registra la asignación con valores válidos', async () => {
    periodoService.list.mockResolvedValue([periodo]);
    categoriaService.listExpense.mockResolvedValue([categoria]);
    budgetService.createBudget.mockResolvedValue({ id: 'b-1', periodoId: 'p-1', totalAmount: 0, createdAt: '', updatedAt: '' });
    budgetService.getBudget.mockResolvedValue(noBudget);
    budgetService.getOverruns.mockResolvedValue({ excedenteTotal: 0, excedentes: [] });
    budgetService.createAllocation.mockResolvedValue({} as AsignacionPresupuesto);

    fixture.detectChanges();
    await settle();

    component.allocationCategoryId = 'c-1';
    component.allocationAmount = 1500;
    await component.addAllocation();

    expect(budgetService.createAllocation).toHaveBeenCalledWith('p-1', 'c-1', 1500);
    expect(component.allocationMsg).toBe('Asignación registrada.');
    expect(component.allocationAmount).toBe(0);
  });

  it('deleteAllocation elimina la asignación', async () => {
    budgetService.deleteAllocation.mockResolvedValue(undefined);
    budgetService.getBudget.mockResolvedValue(budgetData);
    budgetService.getOverruns.mockResolvedValue(overruns);
    const allocation: AsignacionPresupuesto = budgetData.asignaciones[0];

    await component.deleteAllocation(allocation);

    expect(budgetService.deleteAllocation).toHaveBeenCalledWith('a-1');
  });

  it('totalDisponible es total menos asignado', () => {
    component.budget = budgetData;
    expect(component.totalDisponible()).toBe(3000);

    component.budget = noBudget;
    expect(component.totalDisponible()).toBe(0);
  });

  it('getCategoryName devuelve el nombre o un guion', () => {
    component.categoriasGasto = [categoria];
    expect(component.getCategoryName('c-1')).toBe('Alimentación');
    expect(component.getCategoryName('nope')).toBe('—');
  });

  it('formatCurrency formatea en quetzales', () => {
    expect(component.formatCurrency(1234.56)).toBe('Q 1,234.56');
  });

  it('formatDate formatea en dd/mm/yyyy', () => {
    expect(component.formatDate('2026-01-10T12:00:00.000Z')).toBe('10/01/2026');
  });
});