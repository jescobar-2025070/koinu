import { ChangeDetectorRef, Component, inject, OnInit } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { SidebarService } from '../../../../core/services/sidebar.service';
import { MovimientoService } from '../../../../core/services/movimiento.service';
import { CategoriaService } from '../../../../core/services/categoria.service';
import { TratamientoFiscalService } from '../../../../core/services/tratamiento-fiscal.service';
import { Movimiento, Categoria, TratamientoFiscal } from '../../../../core/models/api.models';

@Component({
  selector: 'app-movements-history-income',
  imports: [FormsModule],
  templateUrl: './history-income.html',
  styleUrl: './history-income.css',
})
export class MovementsHistoryIncome implements OnInit {
  private readonly sidebarService = inject(SidebarService);
  private readonly movimientoService = inject(MovimientoService);
  private readonly categoriaService = inject(CategoriaService);
  private readonly tratamientoFiscalService = inject(TratamientoFiscalService);
  private readonly cdr = inject(ChangeDetectorRef);

  movements: Movimiento[] = [];
  private categories: Categoria[] = [];
  tratamientos: TratamientoFiscal[] = [];
  editingIndex: number | null = null;
  editData = {
    description: '',
    grossAmount: 0,
    retentionAmount: 0,
    taxTreatmentId: '',
  };

  ngOnInit(): void {
    this.sidebarService.setMovements();
    this.loadData();
  }

  private async loadData(): Promise<void> {
    try {
      const [movimientos, categorias, tratamientos] = await Promise.all([
        this.movimientoService.list(),
        this.categoriaService.listIncome(),
        this.tratamientoFiscalService.list().catch(() => []),
      ]);
      this.categories = categorias;
      this.tratamientos = tratamientos;
      this.movements = movimientos.filter((m) => m.type === 'INCOME');
      this.cdr.markForCheck();
    } catch (e) {
      console.error('Error loading income history:', e);
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

  editMovement(index: number): void {
    const movement = this.movements[index];
    this.editingIndex = index;
    this.editData = {
      description: movement.description ?? '',
      grossAmount: movement.amount,
      retentionAmount: 0,
      taxTreatmentId: this.tratamientos[0]?.id ?? '',
    };
    void this.movimientoService.getById(movement.id).then((res) => {
      if (res?.detalle) {
        this.editData.grossAmount = res.detalle.grossAmount;
        this.editData.retentionAmount = res.detalle.retentionAmount;
        this.editData.taxTreatmentId = res.detalle.taxTreatmentId ?? this.editData.taxTreatmentId;
      }
      this.cdr.markForCheck();
    });
    this.cdr.markForCheck();
  }

  get editNeto(): number {
    return this.editData.grossAmount - this.editData.retentionAmount;
  }

  applyTreatmentRate(): void {
    const treatment = this.tratamientos.find((t) => t.id === this.editData.taxTreatmentId);
    if (treatment) {
      this.editData.retentionAmount = Math.round(this.editData.grossAmount * treatment.rate * 100) / 100;
    }
    this.cdr.markForCheck();
  }

  async saveEdit(movement: Movimiento): Promise<void> {
    try {
      const updated = await this.movimientoService.update(movement.id, {
        grossAmount: this.editData.grossAmount,
        retentionAmount: this.editData.retentionAmount,
        taxTreatmentId: this.editData.taxTreatmentId || undefined,
        description: this.editData.description,
      });
      const idx = this.movements.findIndex((m) => m.id === movement.id);
      if (idx !== -1) {
        this.movements[idx] = { ...this.movements[idx], amount: updated.amount, description: updated.description };
      }
      this.cdr.markForCheck();
    } catch (e) {
      console.error('Error saving income edit:', e);
    } finally {
      this.editingIndex = null;
      this.cdr.markForCheck();
    }
  }

  cancelEdit(): void {
    this.editingIndex = null;
    this.cdr.markForCheck();
  }
}
