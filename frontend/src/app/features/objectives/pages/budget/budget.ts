import { ChangeDetectorRef, Component, inject, OnInit } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { SidebarService } from '../../../../core/services/sidebar.service';
import { BudgetService } from '../../../../core/services/budget.service';
import { PeriodoService } from '../../../../core/services/periodo.service';
import { CategoriaService } from '../../../../core/services/categoria.service';
import { MovimientoService } from '../../../../core/services/movimiento.service';
import { DialogService } from '../../../../core/services/dialog.service';
import {
  AsignacionPresupuesto,
  BudgetData,
  Categoria,
  Movimiento,
  Periodo,
} from '../../../../core/models/api.models';

@Component({
  selector: 'app-objectives-budget',
  imports: [FormsModule],
  templateUrl: './budget.html',
  styleUrl: './budget.css',
})
export class ObjectivesBudget implements OnInit {
  private readonly sidebarService = inject(SidebarService);
  private readonly budgetService = inject(BudgetService);
  private readonly periodoService = inject(PeriodoService);
  private readonly categoriaService = inject(CategoriaService);
  private readonly movimientoService = inject(MovimientoService);
  private readonly dialogService = inject(DialogService);
  private readonly cdr = inject(ChangeDetectorRef);

  periodos: Periodo[] = [];
  selectedPeriodId = '';
  budget: BudgetData | null = null;
  movements: Movimiento[] = [];

  categoriasGasto: Categoria[] = [];
  allocationCategoryId = '';
  allocationAmount = 0;
  savingAllocation = false;
  allocationMsg = '';

  ngOnInit(): void {
    this.sidebarService.setObjectives();
    this.loadPeriods();
  }

  private async loadPeriods(): Promise<void> {
    try {
      this.periodos = await this.periodoService.list();
      const active = this.periodos.find((p) => p.status === 'ACTIVE');
      this.selectedPeriodId = active?.id ?? this.periodos[0]?.id ?? '';
      this.categoriasGasto = await this.categoriaService.listExpense();
      await this.loadBudget();
    } catch (e) {
      console.error('Error loading periods:', e);
    }
  }

  selectPeriod(): void {
    this.budget = null;
    this.allocationMsg = '';
    void this.loadBudget();
  }

  private async loadBudget(): Promise<void> {
    if (!this.selectedPeriodId) {
      return;
    }
    try {
      await this.budgetService.createBudget(this.selectedPeriodId);
      this.budget = await this.budgetService.getBudget(this.selectedPeriodId);
      this.movements = await this.movimientoService.list(this.selectedPeriodId);
      this.cdr.markForCheck();
    } catch (e) {
      console.error('Error loading budget:', e);
    }
  }

  isActivePeriod(): boolean {
    const p = this.periodos.find((x) => x.id === this.selectedPeriodId);
    return p?.status === 'ACTIVE' || p?.status === 'DRAFT';
  }

  getCategoryName(id: string): string {
    return this.categoriasGasto.find((c) => c.id === id)?.name ?? '—';
  }

  totalDisponible(): number {
    return this.budget && this.budget.presupuesto
      ? Math.max(0, Number(this.budget.presupuesto.totalAmount) - this.budget.asignadoTotal)
      : 0;
  }

  consumedByCategory(categoriaGastoId: string): number {
    return this.movements
      .filter((m) => m.type === 'EXPENSE' && m.expenseCategoryId === categoriaGastoId)
      .reduce((sum, m) => sum + Number(m.amount), 0);
  }

  remainingOf(a: AsignacionPresupuesto): number {
    return Math.max(0, Number(a.amount) - this.consumedByCategory(a.categoriaGastoId));
  }

  async addAllocation(): Promise<void> {
    if (!this.allocationCategoryId || this.allocationAmount <= 0 || !this.selectedPeriodId) {
      this.allocationMsg = 'Selecciona una categoría e indica un monto mayor a 0.';
      return;
    }
    this.savingAllocation = true;
    this.allocationMsg = '';
    try {
      await this.budgetService.createAllocation(
        this.selectedPeriodId,
        this.allocationCategoryId,
        this.allocationAmount,
      );
      this.allocationAmount = 0;
      this.allocationMsg = 'Asignación registrada.';
      await this.loadBudget();
    } catch (e: any) {
      this.allocationMsg = e?.error?.error?.message || 'No se pudo registrar la asignación.';
    } finally {
      this.savingAllocation = false;
      this.cdr.markForCheck();
    }
  }

  async updateAllocation(a: AsignacionPresupuesto): Promise<void> {
    const next = await this.dialogService.prompt({
      title: 'EDITAR MONTO ASIGNADO',
      message: `Categoría: ${this.getCategoryName(a.categoriaGastoId)}`,
      label: 'Nuevo monto (Q)',
      value: String(a.amount),
      confirmLabel: 'Guardar',
    });
    if (next === null) {
      return;
    }
    const parsed = parseFloat(next);
    if (isNaN(parsed) || parsed <= 0) {
      this.allocationMsg = 'El monto debe ser un número mayor a 0.';
      this.cdr.markForCheck();
      return;
    }
    try {
      await this.budgetService.updateAllocation(a.id, parsed);
      this.allocationMsg = 'Asignación actualizada.';
      await this.loadBudget();
    } catch (e: any) {
      this.allocationMsg = e?.error?.error?.message || 'No se pudo actualizar la asignación.';
      this.cdr.markForCheck();
    }
  }

  async deleteAllocation(a: AsignacionPresupuesto): Promise<void> {
    try {
      await this.budgetService.deleteAllocation(a.id);
      await this.loadBudget();
    } catch (e: any) {
      this.allocationMsg = e?.error?.error?.message || 'No se pudo eliminar la asignación.';
      this.cdr.markForCheck();
    }
  }

  formatCurrency(amount: number): string {
    return (
      'Q ' + amount.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })
    );
  }
}