export interface ExcedentePresupuesto {
  id: string;
  presupuestoId: string;
  movimientoId: string;
  amount: number;
  createdAt: Date;
}

export interface ExcedenteMovimiento {
  id: string;
  date: Date;
  amount: number;
  description: string | null;
  categoriaId: string | null;
  categoriaNombre: string | null;
}

export interface ExcedenteConMovimiento extends ExcedentePresupuesto {
  movimiento: ExcedenteMovimiento;
}