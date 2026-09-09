import { ValidationResult, validationFailure, validationSuccess } from '../validator-result';
import { ObjetivoPriority } from '../../entities/objetivo.entity';

export interface UpdateObjetivoRequest {
  name?: string;
  description?: string;
  targetAmount?: number;
  deadline?: string | null;
  startDate?: string | null;
  periodoId?: string | null;
  priority?: ObjetivoPriority;
}

const VALID_PRIORITIES: ObjetivoPriority[] = ['ALTA', 'MEDIA', 'BAJA'];

export function validateUpdateObjetivoRequest(body: unknown): ValidationResult<UpdateObjetivoRequest> {
  const errors: Record<string, string> = {};
  const data = (body ?? {}) as Record<string, unknown>;
  const result: UpdateObjetivoRequest = {};

  if (data.name !== undefined) {
    const name = typeof data.name === 'string' ? data.name.trim() : '';
    if (!name) {
      errors.name = 'El nombre es obligatorio.';
    } else if (name.length > 100) {
      errors.name = 'El nombre no puede superar los 100 caracteres.';
    } else {
      result.name = name;
    }
  }

  if (data.description !== undefined) {
    const description = typeof data.description === 'string' ? data.description.trim() : '';
    if (description.length > 500) {
      errors.description = 'La descripción no puede superar los 500 caracteres.';
    } else {
      result.description = description;
    }
  }

  if (data.targetAmount !== undefined) {
    const targetAmount = typeof data.targetAmount === 'number' ? data.targetAmount : parseFloat(data.targetAmount as string);
    if (isNaN(targetAmount) || targetAmount <= 0) {
      errors.targetAmount = 'El monto objetivo debe ser un número mayor a 0.';
    } else {
      result.targetAmount = targetAmount;
    }
  }

  if (data.deadline !== undefined) {
    const deadline = data.deadline === null || data.deadline === ''
      ? null
      : typeof data.deadline === 'string'
        ? data.deadline.trim()
        : undefined;
    if (deadline === undefined) {
      errors.deadline = 'La fecha límite no tiene un formato válido.';
    } else if (deadline !== null && isNaN(Date.parse(deadline))) {
      errors.deadline = 'La fecha límite no tiene un formato válido.';
    } else if (deadline === null) {
      result.deadline = null;
    } else {
      result.deadline = deadline;
    }
  }

  if (data.startDate !== undefined) {
    const startDate = data.startDate === null || data.startDate === ''
      ? null
      : typeof data.startDate === 'string'
        ? data.startDate.trim()
        : undefined;
    if (startDate === undefined) {
      errors.startDate = 'La fecha de inicio no tiene un formato válido.';
    } else if (startDate !== null && isNaN(Date.parse(startDate))) {
      errors.startDate = 'La fecha de inicio no tiene un formato válido.';
    } else if (startDate === null) {
      result.startDate = null;
    } else {
      result.startDate = startDate;
    }
  }

  if (data.periodoId !== undefined) {
    if (data.periodoId === null) {
      result.periodoId = null;
    } else if (typeof data.periodoId === 'string' && data.periodoId.trim()) {
      result.periodoId = data.periodoId.trim();
    } else {
      errors.periodoId = 'El identificador del período no es válido.';
    }
  }

  if (data.priority !== undefined) {
    if (data.priority === null || data.priority === '') {
      errors.priority = 'La prioridad debe ser ALTA, MEDIA o BAJA.';
    } else {
      const priority = typeof data.priority === 'string'
        ? data.priority.trim().toUpperCase() as ObjetivoPriority
        : undefined;
      if (priority === undefined || !VALID_PRIORITIES.includes(priority)) {
        errors.priority = 'La prioridad debe ser ALTA, MEDIA o BAJA.';
      } else {
        result.priority = priority;
      }
    }
  }

  if (Object.keys(errors).length > 0) {
    return validationFailure<UpdateObjetivoRequest>(errors);
  }

  return validationSuccess<UpdateObjetivoRequest>(result);
}