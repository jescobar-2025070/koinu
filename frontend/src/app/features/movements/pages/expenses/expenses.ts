import { ChangeDetectorRef, Component, inject, OnInit } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { SidebarService } from '../../../../core/services/sidebar.service';
import { PeriodoService } from '../../../../core/services/periodo.service';
import { CategoriaService } from '../../../../core/services/categoria.service';
import { MovimientoService } from '../../../../core/services/movimiento.service';
import { Periodo, Categoria, ExpenseType } from '../../../../core/models/api.models';
import { todayLocalISO } from '../../../../core/utils/date.util';

@Component({
  selector: 'app-movements-expenses',
  imports: [FormsModule],
  templateUrl: './expenses.html',
  styleUrl: './expenses.css',
})
export class MovementsExpenses implements OnInit {
  private readonly sidebarService = inject(SidebarService);
  private readonly periodoService = inject(PeriodoService);
  private readonly categoriaService = inject(CategoriaService);
  private readonly movimientoService = inject(MovimientoService);
  private readonly cdr = inject(ChangeDetectorRef);

  periodos: Periodo[] = [];
  categorias: Categoria[] = [];
  selectedPeriodoId = '';
  selectedCategoriaId = '';
  selectedTipo: ExpenseType = 'VARIABLE';
  monto = 0;
  metodo = 'Efectivo';
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
      const [periodos, categorias] = await Promise.all([
        this.periodoService.list(),
        this.categoriaService.listExpense(),
      ]);
      this.periodos = periodos.filter((p) => p.status === 'ACTIVE');
      this.categorias = categorias;

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

  formatCurrency(amount: number): string {
    return 'Q ' + amount.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  }

  async saveExpense(): Promise<void> {
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
        type: 'EXPENSE',
        expenseCategoryId: this.selectedCategoriaId,
        amount: this.monto,
        expenseType: this.selectedTipo,
        description: this.descripcion || undefined,
        date: this.fecha || undefined,
      });
      this.saveMessage = '✓ Gasto guardado';
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
