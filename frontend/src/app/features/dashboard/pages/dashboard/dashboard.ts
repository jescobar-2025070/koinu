import { ChangeDetectorRef, Component, inject, OnInit } from '@angular/core';
import { SidebarService } from '../../../../core/services/sidebar.service';
import { PeriodoService } from '../../../../core/services/periodo.service';
import { DashboardService } from '../../../../core/services/dashboard.service';
import { DashboardData } from '../../../../core/models/api.models';

@Component({
  selector: 'app-dashboard',
  templateUrl: './dashboard.html',
  styleUrl: './dashboard.css',
})
export class Dashboard implements OnInit {
  private readonly sidebarService = inject(SidebarService);
  private readonly periodoService = inject(PeriodoService);
  private readonly dashboardService = inject(DashboardService);
  private readonly cdr = inject(ChangeDetectorRef);

  data: DashboardData | null = null;
  hasActivePeriod = false;
  loading = true;
  periodEnd = '—';
  objetivoCurrent = 0;
  objetivoTarget = 0;
  objetivoProgress = 0;

  ngOnInit(): void {
    this.sidebarService.setDashboard();
    this.loadData();
  }

  private async loadData(): Promise<void> {
    try {
      const periodos = await this.periodoService.list();
      const activePeriod = periodos.find((p) => p.status === 'ACTIVE');

      if (activePeriod) {
        this.hasActivePeriod = true;
        this.periodEnd = this.formatDate(new Date(activePeriod.endDate));
        this.data = await this.dashboardService.get(activePeriod.id);

        const firstGoal = this.data.objetivos.find((o) => o.status === 'ACTIVE') ?? this.data.objetivos[0];
        if (firstGoal) {
          this.objetivoCurrent = firstGoal.currentAmount;
          this.objetivoTarget = firstGoal.targetAmount;
          this.objetivoProgress = firstGoal.progress;
        }
      }
    } catch (e) {
      console.error('Error loading dashboard data:', e);
    } finally {
      this.loading = false;
      this.cdr.markForCheck();
    }
  }

  formatCurrency(amount: number): string {
    return 'Q ' + amount.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  }

  formatDate(value: string | Date): string {
    const date = typeof value === 'string' ? new Date(value) : value;
    const d = String(date.getDate()).padStart(2, '0');
    const m = String(date.getMonth() + 1).padStart(2, '0');
    const y = date.getFullYear();
    return `${d}/${m}/${y}`;
  }
}