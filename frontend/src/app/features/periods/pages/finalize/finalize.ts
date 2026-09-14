import { ChangeDetectorRef, Component, inject, OnInit } from '@angular/core';
import { Router } from '@angular/router';
import { SidebarService } from '../../../../core/services/sidebar.service';
import { PeriodoService } from '../../../../core/services/periodo.service';
import { MovimientoService } from '../../../../core/services/movimiento.service';
import { DialogService } from '../../../../core/services/dialog.service';
import { Periodo } from '../../../../core/models/api.models';

@Component({
  selector: 'app-periods-finalize',
  templateUrl: './finalize.html',
  styleUrl: './finalize.css',
})
export class PeriodsFinalize implements OnInit {
  private readonly sidebarService = inject(SidebarService);
  private readonly periodoService = inject(PeriodoService);
  private readonly movimientoService = inject(MovimientoService);
  private readonly dialogService = inject(DialogService);
  private readonly router = inject(Router);
  private readonly cdr = inject(ChangeDetectorRef);

  currentPeriod: Periodo | null = null;
  periodName = '';
  periodRange = '';
  totalIngresos = 0;
  totalGastos = 0;
  saveMessage = '';
  finalizing = false;
  finalized = false;
  finalizedName = '';

  ngOnInit(): void {
    this.sidebarService.setPeriods();
    this.loadPeriod();
  }

  private async loadPeriod(): Promise<void> {
    try {
      const periodos = await this.periodoService.list();
      this.currentPeriod = periodos.find((p) => p.status === 'ACTIVE') ?? null;
      if (this.currentPeriod) {
        this.periodName = this.currentPeriod.name;
        this.periodRange = `${this.formatDate(new Date(this.currentPeriod.startDate))} — ${this.formatDate(new Date(this.currentPeriod.endDate))}`;
        const stats = await this.movimientoService.stats(this.currentPeriod.id);
        this.totalIngresos = stats.totalIngresos;
        this.totalGastos = stats.totalGastos;
      }
      this.cdr.markForCheck();
    } catch (e) {
      console.error('Error loading period:', e);
    }
  }

  private formatDate(date: Date): string {
    const d = String(date.getDate()).padStart(2, '0');
    const m = String(date.getMonth() + 1).padStart(2, '0');
    const y = date.getFullYear();
    return `${d}/${m}/${y}`;
  }

  formatCurrency(amount: number): string {
    return 'Q ' + amount.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  }

  async finalizePeriod(): Promise<void> {
    if (!this.currentPeriod) return;
    const confirmed = await this.dialogService.confirm({
      title: 'FINALIZAR PERÍODO',
      message: `¿Finalizar "${this.currentPeriod.name}"? Se guardará el informe final y el período dejará de estar activo.`,
      confirmLabel: 'Finalizar',
      danger: true,
    });
    if (!confirmed) return;
    this.finalizing = true;
    this.saveMessage = '';
    try {
      await this.periodoService.finalize(this.currentPeriod.id);
      this.finalizedName = this.currentPeriod.name;
      this.saveMessage = '✓ Período finalizado';
      this.currentPeriod = null;
      this.finalized = true;
    } catch (e: any) {
      this.saveMessage = '✗ ' + (e?.error?.error?.message ?? 'Error al finalizar');
      this.finalized = false;
    } finally {
      this.finalizing = false;
      this.cdr.markForCheck();
      setTimeout(() => {
        this.saveMessage = '';
        this.cdr.markForCheck();
      }, 3000);
    }
  }

  goNewPeriod(): void {
    void this.router.navigateByUrl('/periods/new');
  }

  goHistory(): void {
    void this.router.navigateByUrl('/periods/history');
  }
}
