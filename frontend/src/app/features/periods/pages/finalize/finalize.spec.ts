import { TestBed, ComponentFixture } from '@angular/core/testing';
import { provideZonelessChangeDetection } from '@angular/core';
import { Router } from '@angular/router';
import { PeriodsFinalize } from './finalize';
import { PeriodoService } from '../../../../core/services/periodo.service';
import { MovimientoService } from '../../../../core/services/movimiento.service';
import { SidebarService } from '../../../../core/services/sidebar.service';
import { Periodo } from '../../../../core/models/api.models';

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

type Mock<T> = { [K in keyof T]: ReturnType<typeof vi.fn> };

async function settle(): Promise<void> {
  for (let i = 0; i < 6; i++) {
    await Promise.resolve();
  }
  await new Promise<void>((resolve) => setTimeout(resolve, 0));
}

describe('PeriodsFinalize', () => {
  let fixture: ComponentFixture<PeriodsFinalize>;
  let component: PeriodsFinalize;
  let periodoService: Mock<PeriodoService>;
  let movimientoService: Mock<MovimientoService>;
  let sidebarService: Mock<SidebarService>;
  let router: { navigateByUrl: ReturnType<typeof vi.fn> };

  beforeEach(() => {
    periodoService = { list: vi.fn(), finalize: vi.fn() } as Mock<PeriodoService>;
    movimientoService = { stats: vi.fn() } as Mock<MovimientoService>;
    sidebarService = { setPeriods: vi.fn() } as Mock<SidebarService>;
    router = { navigateByUrl: vi.fn() };

    TestBed.configureTestingModule({
      imports: [PeriodsFinalize],
      providers: [
        provideZonelessChangeDetection(),
        { provide: PeriodoService, useValue: periodoService },
        { provide: MovimientoService, useValue: movimientoService },
        { provide: SidebarService, useValue: sidebarService },
        { provide: Router, useValue: router },
      ],
    });

    fixture = TestBed.createComponent(PeriodsFinalize);
    component = fixture.componentInstance;
  });

  it('carga el período ACTIVE y muestra sus totales', async () => {
    periodoService.list.mockResolvedValue([periodo]);
    movimientoService.stats.mockResolvedValue({ totalIngresos: 5000, totalGastos: 3200 });

    fixture.detectChanges();
    await settle();
    fixture.detectChanges();

    expect(component.currentPeriod).toEqual(periodo);
    expect(component.periodName).toBe('Enero 2026');
    expect(component.totalIngresos).toBe(5000);
    expect(component.totalGastos).toBe(3200);
    const inputs = Array.from(fixture.nativeElement.querySelectorAll('input') as NodeListOf<HTMLInputElement>).map((i) => i.value);
    expect(inputs).toContain('Enero 2026');
    expect(inputs).toContain('Q 5,000.00');
    expect(inputs).toContain('Q 3,200.00');
    expect(sidebarService.setPeriods).toHaveBeenCalled();
  });

  it('finaliza con confirmación y sugiere crear o seleccionar un nuevo período', async () => {
    const confirmSpy = vi.spyOn(window, 'confirm').mockReturnValue(true);
    periodoService.list.mockResolvedValue([periodo]);
    movimientoService.stats.mockResolvedValue({ totalIngresos: 5000, totalGastos: 3200 });
    periodoService.finalize.mockResolvedValue({ ...periodo, status: 'FINISHED' });

    fixture.detectChanges();
    await settle();
    fixture.detectChanges();

    await component.finalizePeriod();

    expect(confirmSpy).toHaveBeenCalled();
    expect(periodoService.finalize).toHaveBeenCalledWith('p-1');
    expect(component.finalized).toBe(true);
    expect(component.finalizedName).toBe('Enero 2026');

    fixture.detectChanges();
    const text = fixture.nativeElement.textContent;
    expect(text).toContain('fue finalizado');
    expect(text).toContain('Crear nuevo período');
    expect(text).toContain('Ver historial de períodos');
    confirmSpy.mockRestore();
  });

  it('no finaliza si se cancela la confirmación', async () => {
    const confirmSpy = vi.spyOn(window, 'confirm').mockReturnValue(false);

    await component.finalizePeriod();

    expect(periodoService.finalize).not.toHaveBeenCalled();
    confirmSpy.mockRestore();
  });

  it('finalizePeriod sin período activo no llama al servicio', async () => {
    periodoService.list.mockResolvedValue([]);

    fixture.detectChanges();
    await settle();
    fixture.detectChanges();

    const text = fixture.nativeElement.textContent;
    expect(text).toContain('No hay período abierto para finalizar');
    expect(periodoService.finalize).not.toHaveBeenCalled();
  });

  it('muestra el error del servidor al fallar la finalización', async () => {
    const confirmSpy = vi.spyOn(window, 'confirm').mockReturnValue(true);
    periodoService.list.mockResolvedValue([periodo]);
    movimientoService.stats.mockResolvedValue({ totalIngresos: 5000, totalGastos: 3200 });
    periodoService.finalize.mockRejectedValue({
      error: { error: { message: 'Solo se pueden finalizar períodos en estado ACTIVE.' } },
    });

    fixture.detectChanges();
    await settle();

    await component.finalizePeriod();

    expect(component.finalized).toBe(false);
    expect(component.saveMessage).toContain('Solo se pueden finalizar períodos en estado ACTIVE.');
    confirmSpy.mockRestore();
  });

  it('goNewPeriod y goHistory navegan a las rutas esperadas', () => {
    component.goNewPeriod();
    expect(router.navigateByUrl).toHaveBeenCalledWith('/periods/new');

    component.goHistory();
    expect(router.navigateByUrl).toHaveBeenCalledWith('/periods/history');
  });
});