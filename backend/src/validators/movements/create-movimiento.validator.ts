import { ValidationResult, validationFailure, validationSuccess } from '../validator-result';

interface CreateMovimientoRequest {
  periodId: string;
  type: 'INCOME' | 'EXPENSE';
  incomeCategoryId?: string;
  expenseCategoryId?: string;
  grossAmount?: number;
  retentionAmount?: number;
  taxTreatmentId?: string;
  amount?: number;
  incomeClassification?: string;
  expenseType?: string;
  description?: string;
  date?: string;
}

export function validateCreateMovimientoRequest(body: unknown): ValidationResult<CreateMovimientoRequest> {
  const errors: Record<string, string> = {};
  const data = (body ?? {}) as Record<string, unknown>;

  const periodId = typeof data.periodId === 'string' ? data.periodId.trim() : '';
  const type = typeof data.type === 'string' ? data.type.trim().toUpperCase() : '';
  const incomeCategoryId = typeof data.incomeCategoryId === 'string' ? data.incomeCategoryId.trim() : undefined;
  const expenseCategoryId = typeof data.expenseCategoryId === 'string' ? data.expenseCategoryId.trim() : undefined;
  const taxTreatmentId = typeof data.taxTreatmentId === 'string' ? data.taxTreatmentId.trim() : undefined;
  const incomeClassification = typeof data.incomeClassification === 'string' ? data.incomeClassification.trim().toUpperCase() : '';
  const expenseType = typeof data.expenseType === 'string' ? data.expenseType.trim().toUpperCase() : '';
  const description = typeof data.description === 'string' ? data.description.trim() : undefined;
  const date = typeof data.date === 'string' ? data.date.trim() : undefined;

  const grossAmount = typeof data.grossAmount === 'number' ? data.grossAmount : parseFloat(data.grossAmount as string);
  const retentionAmount = data.retentionAmount !== undefined
    ? (typeof data.retentionAmount === 'number' ? data.retentionAmount : parseFloat(data.retentionAmount as string))
    : 0;
  const amount = typeof data.amount === 'number' ? data.amount : parseFloat(data.amount as string);

  if (!periodId) {
    errors.periodId = 'El período es obligatorio.';
  }

  if (!type || !['INCOME', 'EXPENSE'].includes(type)) {
    errors.type = 'El tipo debe ser "INCOME" o "EXPENSE".';
  }

  if (type === 'INCOME') {
    if (!incomeCategoryId) {
      errors.incomeCategoryId = 'La categoría de ingreso es obligatoria.';
    }
    if (!incomeClassification) {
      errors.incomeClassification = 'La clasificación del ingreso es obligatoria.';
    } else if (!['REGULAR', 'OCASIONAL'].includes(incomeClassification)) {
      errors.incomeClassification = 'La clasificación del ingreso debe ser REGULAR u OCASIONAL.';
    }
    if (isNaN(grossAmount) || grossAmount <= 0) {
      errors.grossAmount = 'El monto bruto debe ser un número mayor a 0.';
    }
    if (isNaN(retentionAmount) || retentionAmount < 0) {
      errors.retentionAmount = 'La retención debe ser un número mayor o igual a 0.';
    }
  } else if (type === 'EXPENSE') {
    if (!expenseCategoryId) {
      errors.expenseCategoryId = 'La categoría de gasto es obligatoria.';
    }
    if (!expenseType) {
      errors.expenseType = 'El tipo de gasto es obligatorio.';
    } else if (!['FIJO', 'VARIABLE'].includes(expenseType)) {
      errors.expenseType = 'El tipo de gasto debe ser FIJO o VARIABLE.';
    }
    if (isNaN(amount) || amount <= 0) {
      errors.amount = 'El monto debe ser un número mayor a 0.';
    }
  }

  if (description !== undefined && description.length > 500) {
    errors.description = 'La descripción no puede superar los 500 caracteres.';
  }

  if (date !== undefined && isNaN(Date.parse(date))) {
    errors.date = 'La fecha no tiene un formato válido.';
  }

  if (Object.keys(errors).length > 0) {
    return validationFailure<CreateMovimientoRequest>(errors);
  }

  return validationSuccess<CreateMovimientoRequest>({
    periodId,
    type: type as 'INCOME' | 'EXPENSE',
    incomeCategoryId,
    expenseCategoryId,
    grossAmount: type === 'INCOME' ? grossAmount : undefined,
    retentionAmount: type === 'INCOME' ? retentionAmount : undefined,
    taxTreatmentId,
    amount: type === 'EXPENSE' ? amount : undefined,
    incomeClassification: type === 'INCOME' ? incomeClassification : undefined,
    expenseType: type === 'EXPENSE' ? expenseType : undefined,
    description,
    date,
  });
}
