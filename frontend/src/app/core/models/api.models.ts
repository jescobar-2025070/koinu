export type PeriodoStatus = 'DRAFT' | 'ACTIVE' | 'CANCELLED' | 'FINISHED';

export interface Periodo {
  id: string;
  userId: string;
  name: string;
  startDate: string;
  endDate: string;
  status: PeriodoStatus;
  createdAt: string;
  updatedAt: string;
  deletedAt: string | null;
}

export interface AdminPeriod extends Periodo {
  userEmail: string;
}

export type MovimientoType = 'INCOME' | 'EXPENSE';

export interface Movimiento {
  id: string;
  userId: string;
  periodoId: string;
  type: MovimientoType;
  incomeCategoryId: string | null;
  expenseCategoryId: string | null;
  amount: number;
  description: string | null;
  date: string;
  createdAt: string;
  updatedAt: string;
  deletedAt: string | null;
}

export interface DetalleIngreso {
  movementId: string;
  taxTreatmentId: string | null;
  grossAmount: number;
  retentionAmount: number;
  netAmount: number;
}

export interface Categoria {
  id: string;
  userId: string | null;
  name: string;
  isDefault: boolean;
  isActive: boolean;
  createdAt: string;
}

export type ObjetivoStatus = 'ACTIVE' | 'COMPLETED' | 'CANCELLED';

export interface Objetivo {
  id: string;
  userId: string;
  periodoId: string | null;
  name: string;
  description: string | null;
  targetAmount: number;
  currentAmount: number;
  deadline: string | null;
  startDate: string | null;
  status: ObjetivoStatus;
  createdAt: string;
  updatedAt: string;
}

export interface Presupuesto {
  id: string;
  periodoId: string;
  totalAmount: number;
  createdAt: string;
  updatedAt: string;
}

export interface AsignacionPresupuesto {
  id: string;
  presupuestoId: string;
  categoriaGastoId: string;
  amount: number;
  createdAt: string;
}

export interface ExcedentePresupuesto {
  id: string;
  presupuestoId: string;
  movimientoId: string;
  amount: number;
  createdAt: string;
}

export interface BudgetData {
  presupuesto: Presupuesto | null;
  asignaciones: AsignacionPresupuesto[];
  asignadoTotal: number;
  excedenteTotal: number;
}

export interface OverrunsData {
  excedenteTotal: number;
  excedentes: ExcedentePresupuesto[];
}

export interface MovimientoStats {
  totalIngresos: number;
  totalGastos: number;
}

export interface DashboardObjetivo {
  id: string;
  name: string;
  currentAmount: number;
  targetAmount: number;
  progress: number;
  status: string;
  periodoId: string | null;
}

export interface DashboardData {
  periodoActivo: {
    id: string;
    name: string;
    startDate: string;
    endDate: string;
  } | null;
  totalIngresos: number;
  totalGastos: number;
  disponiblePorIngresos: number;
  presupuesto: {
    id: string;
    totalAmount: number;
    asignadoTotal: number;
    excedenteTotal: number;
    asignaciones: AsignacionPresupuesto[];
  } | null;
  disponiblePorPresupuesto: number | null;
  disponible: number;
  objetivos: DashboardObjetivo[];
}

export interface ReportCategoryRow {
  categoriaId: string | null;
  nombre: string;
  tipo: MovimientoType;
  total: number;
  presupuestado: number | null;
}

export interface ReportData {
  periodo: {
    id: string;
    name: string;
    startDate: string;
    endDate: string;
    status: string;
  };
  totalIngresos: number;
  totalGastos: number;
  disponible: number;
  presupuesto: {
    total: number;
    asignado: number;
    disponible: number;
    excedente: number;
  } | null;
  porCategoria: ReportCategoryRow[];
  objetivos: {
    id: string;
    name: string;
    currentAmount: number;
    targetAmount: number;
    progress: number;
    status: string;
  }[];
  recomendaciones: string[];
  generadoEn: string;
}

export interface SystemHealth {
  status: string;
  db: string;
  uptimeSeconds: number;
  timestamp: string;
}

export interface TratamientoFiscal {
  id: string;
  name: string;
  rate: number;
  isActive: boolean;
  createdAt: string;
}