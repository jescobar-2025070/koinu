export type MovimientoType = 'INCOME' | 'EXPENSE';
export type IncomeClassification = 'REGULAR' | 'OCASIONAL';
export type ExpenseType = 'FIJO' | 'VARIABLE';

export interface Movimiento {
  id: string;
  userId: string;
  periodoId: string;
  type: MovimientoType;
  incomeCategoryId: string | null;
  expenseCategoryId: string | null;
  amount: number;
  description: string | null;
  incomeClassification: IncomeClassification | null;
  expenseType: ExpenseType | null;
  date: Date;
  createdAt: Date;
  updatedAt: Date;
  deletedAt: Date | null;
}