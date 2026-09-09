import { TestBed, ComponentFixture } from '@angular/core/testing';
import { provideZonelessChangeDetection } from '@angular/core';
import { ObjectivesMain } from './main';
import { ObjetivoService } from '../../../../core/services/objetivo.service';
import { PeriodoService } from '../../../../core/services/periodo.service';
import { SidebarService } from '../../../../core/services/sidebar.service';
import { Objetivo, Periodo } from '../../../../core/models/api.models';

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

const objetivo: Objetivo = {
  id: 'o-1',
  userId: 'u-1',
  periodoId: 'p-1',
  name: 'Viaje 2028',
  description: null,
  targetAmount: 10000,
  currentAmount: 2500,
  deadline: null,
  startDate: '2026-01-01T00:00:00.000Z',
  priority: 'ALTA',
  status: 'ACTIVE',
  createdAt: '2026-01-01T00:00:00.000Z',
  updatedAt: '2026-01-01T00:00:00.000Z',
};

type Mock<T> = { [K in keyof T]: ReturnType<typeof vi.fn> };

async function settle(): Promise<void> {
  for (let i = 0; i < 6; i++) {
    await Promise.resolve();
  }
  await new Promise<void>((resolve) => setTimeout(resolve, 0));
}

describe('ObjectivesMain', () => {
  let fixture: ComponentFixture<ObjectivesMain>;
  let component: ObjectivesMain;
  let objetivoService: Mock<ObjetivoService>;
  let periodoService: Mock<PeriodoService>;
  let sidebarService: Mock<SidebarService>;

  beforeEach(() => {
    objetivoService = {
      list: vi.fn(),
      create: vi.fn(),
      update: vi.fn(),
      delete: vi.fn(),
      deposit: vi.fn(),
      withdraw: vi.fn(),
      complete: vi.fn(),
      cancel: vi.fn(),
      listByPeriod: vi.fn(),
      createByPeriod: vi.fn(),
    };
    periodoService = { list: vi.fn() } as Mock<PeriodoService>;
    sidebarService = { setObjectives: vi.fn() } as Mock<SidebarService>;

    TestBed.configureTestingModule({
      imports: [ObjectivesMain],
      providers: [
        provideZonelessChangeDetection(),
        { provide: ObjetivoService, useValue: objetivoService },
        { provide: PeriodoService, useValue: periodoService },
        { provide: SidebarService, useValue: sidebarService },
      ],
    });

    fixture = TestBed.createComponent(ObjectivesMain);
    component = fixture.componentInstance;
  });

  it('carga objetivos y muestra la prioridad en la tarjeta', async () => {
    objetivoService.list.mockResolvedValue([objetivo]);
    periodoService.list.mockResolvedValue([periodo]);

    fixture.detectChanges();
    await settle();
    fixture.detectChanges();

    const text = fixture.nativeElement.textContent;
    expect(text).toContain('Viaje 2028');
    expect(text).toContain('Prioridad Alta');
    expect(sidebarService.setObjectives).toHaveBeenCalled();
  });

  it('el formulario nuevo ofrece la prioridad por defecto MEDIA y la envía en create', async () => {
    objetivoService.list.mockResolvedValue([]);
    periodoService.list.mockResolvedValue([periodo]);
    objetivoService.create.mockResolvedValue(objetivo);

    fixture.detectChanges();
    await settle();

    component.openForm();
    expect(component.formPriority).toBe('MEDIA');

    fixture.detectChanges();
    const text = fixture.nativeElement.textContent;
    expect(text).toContain('PRIORIDAD');
    expect(text).toContain('Media');

    component.formName = 'Meta nueva';
    component.formTarget = 5000;
    component.formPriority = 'BAJA';
    await component.createObjetivo();

    expect(objetivoService.create).toHaveBeenCalledWith(
      expect.objectContaining({ priority: 'BAJA', name: 'Meta nueva', targetAmount: 5000 }),
    );
  });

  it('priorityLabel traduce el enum a texto', () => {
    expect(component.priorityLabel('ALTA')).toBe('Prioridad Alta');
    expect(component.priorityLabel('MEDIA')).toBe('Prioridad Media');
    expect(component.priorityLabel('BAJA')).toBe('Prioridad Baja');
  });

  it('formatDate devuelve guion cuando no hay fecha', () => {
    expect(component.formatDate(null)).toBe('—');
  });
});