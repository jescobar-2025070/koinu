import { Injectable, signal } from '@angular/core';

export interface SidebarItem {
  label: string;
  route: string;
  icon?: string; // Vuelve a ser un string simple
}

// Colocas las rutas de tus imágenes (asegúrate de que existan en tu carpeta assets)
const DASHBOARD_IMG = '/movimientos.png';
const INGRESOS_IMG = '/ingresos.png';
const GASTOS_IMG = '/gastos.png';
const INFORMES_IMG = '/informes.png';

@Injectable({ providedIn: 'root' })
export class SidebarService {
  readonly title = signal<string | undefined>(undefined);
  readonly items = signal<SidebarItem[]>([]);

  setDashboard(): void {
    this.title.set(undefined);
    this.items.set([
      { label: 'ÚLTIMOS MOVIMIENTOS', route: '/dashboard/movements', icon: DASHBOARD_IMG },
      { label: 'ÚLTIMOS INGRESOS', route: '/dashboard/income', icon: INGRESOS_IMG },
      { label: 'ÚLTIMOS GASTOS', route: '/dashboard/expenses', icon: GASTOS_IMG },
      { label: 'INFORMES', route: '/dashboard/reports', icon: INFORMES_IMG },
    ]);
  }

  setPeriods(): void {
    this.title.set('PERÍODOS');
    this.items.set([
      { label: 'NUEVO PERÍODO', route: '/periods/new' },
      { label: 'FINALIZAR PERÍODO ACTUAL', route: '/periods/finalize' },
      { label: 'MODIFICAR PERÍODO ACTUAL', route: '/periods/edit' },
      { label: 'HISTORIAL DE PERÍODOS', route: '/periods/history' },
    ]);
  }

  setMovements(): void {
    this.title.set('MOVIMIENTOS');
    this.items.set([
      { label: 'INGRESOS', route: '/movements/income' },
      { label: 'GASTOS', route: '/movements/expenses' },
      { label: 'HISTORIAL DE INGRESOS', route: '/movements/history/income' },
      { label: 'HISTORIAL DE GASTOS', route: '/movements/history/expenses' },
    ]);
  }

  setObjectives(): void {
    this.title.set('OBJETIVOS');
    this.items.set([
      { label: 'OBJETIVOS', route: '/objectives' },
      { label: 'PRESUPUESTO', route: '/objectives/budget' },
    ]);
  }

  clear(): void {
    this.title.set(undefined);
    this.items.set([]);
  }
}