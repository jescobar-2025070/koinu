import { ChangeDetectorRef, Component, inject, OnInit } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { SidebarService } from '../../../../core/services/sidebar.service';
import { PeriodoService } from '../../../../core/services/periodo.service';
import { CategoriaService } from '../../../../core/services/categoria.service';
import { MovimientoService } from '../../../../core/services/movimiento.service';
import { TratamientoFiscalService } from '../../../../core/services/tratamiento-fiscal.service';
import { Periodo, Categoria, TratamientoFiscal } from '../../../../core/models/api.models';
import { todayLocalISO } from '../../../../core/utils/date.util';

@Component({
  selector: 'app-movements-income',
  imports: [FormsModule],
  templateUrl: './income.html',
  styleUrl: './income.css',
})
export class MovementsIncome implements OnInit {
  private readonly sidebarService = inject(SidebarService);
  private readonly periodoService = inject(PeriodoService);
  private readonly categoriaService = inject(CategoriaService);
  private readonly movimientoService = inject(MovimientoService);
  private readonly tratamientoFiscalService = inject(TratamientoFiscalService);
  private readonly cdr = inject(ChangeDetectorRef);

  periodos: Periodo[] = [];
  categorias: Categoria[] = [];
  tratamientos: TratamientoFiscal[] = [];
  selectedPeriodoId = '';
  selectedCategoriaId = '';
  selectedTratamientoId = '';
  monto = 0;
  descripcion = '';
  fecha = todayLocalISO();
  saveMessage = '';
  saving = false;

  ngOnInit(): void {
    this.sidebarService.setMovements();
    this.loadData();
  }

  private async loadData(): Promise<void> {
    try {
      const [periodos, categorias, tratamientos] = await Promise.all([
        this.periodoService.list(),
        this.categoriaService.listIncome(),
        this.tratamientoFiscalService.list().catch(() => []),
      ]);
      this.periodos = periodos.filter((p) => p.status === 'ACTIVE');
      this.categorias = categorias;
      this.tratamientos = tratamientos;

      const defaultTreatment =
        tratamientos.find((t) => t.rate === 0.05) ?? tratamientos[0];
      this.selectedTratamientoId = defaultTreatment?.id ?? '';

      if (this.periodos.length > 0) {
        this.selectedPeriodoId = this.periodos[0].id;
      }
      this.cdr.markForCheck();
    } catch (e) {
      console.error('Error loading data:', e);
    }
  }

  get hasActivePeriod(): boolean {
    return this.periodos.length > 0;
  }

  get tratamientoSeleccionado(): TratamientoFiscal | undefined {
    return this.tratamientos.find((t) => t.id === this.selectedTratamientoId);
  }

  get retencion(): number {
    const rate = this.tratamientoSeleccionado?.rate ?? 0;
    return this.monto * rate;
  }

  get montoNeto(): number {
    return this.monto - this.retencion;
  }

  formatCurrency(amount: number): string {
    return 'Q ' + amount.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  }

  async saveIncome(): Promise<void> {
    if (!this.selectedPeriodoId || !this.selectedCategoriaId || this.monto <= 0) {
      this.saveMessage = '✗ Complete todos los campos obligatorios';
      setTimeout(() => {
        this.saveMessage = '';
        this.cdr.markForCheck();
      }, 3000);
      return;
    }
    this.saving = true;
    this.saveMessage = '';
    try {
      await this.movimientoService.create({
        periodId: this.selectedPeriodoId,
        type: 'INCOME',
        incomeCategoryId: this.selectedCategoriaId,
        grossAmount: this.monto,
        retentionAmount: this.retencion,
        taxTreatmentId: this.selectedTratamientoId || undefined,
        description: this.descripcion || undefined,
        date: this.fecha || undefined,
      });
      this.saveMessage = '✓ Ingreso guardado';
      this.monto = 0;
      this.descripcion = '';
    } catch (e: any) {
      this.saveMessage = '✗ ' + (e?.error?.error?.message ?? 'Error al guardar');
    } finally {
      this.saving = false;
      this.cdr.markForCheck();
      setTimeout(() => {
        this.saveMessage = '';
        this.cdr.markForCheck();
      }, 3000);
    }
  }
}
