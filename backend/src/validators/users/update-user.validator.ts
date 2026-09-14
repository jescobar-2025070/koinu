import { ValidationResult, validationFailure, validationSuccess } from '../validator-result';

const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export interface SetActiveRequest {
  isActive: boolean;
}

export interface SetRolesRequest {
  roles: string[];
}

export function validateSetActiveRequest(body: unknown): ValidationResult<SetActiveRequest> {
  const errors: Record<string, string> = {};
  const data = (body ?? {}) as Record<string, unknown>;

  const isActive = typeof data.isActive === 'boolean' ? data.isActive : undefined;

  if (isActive === undefined) {
    errors.isActive = 'El campo isActive debe ser un booleano.';
  }

  if (Object.keys(errors).length > 0) {
    return validationFailure<SetActiveRequest>(errors);
  }

  return validationSuccess<SetActiveRequest>({ isActive: isActive as boolean });
}

export function validateSetRolesRequest(body: unknown): ValidationResult<SetRolesRequest> {
  const errors: Record<string, string> = {};
  const data = (body ?? {}) as Record<string, unknown>;

  const roles = Array.isArray(data.roles) ? data.roles : [];

  if (roles.length === 0) {
    errors.roles = 'Debes indicar al menos un rol.';
  } else {
    for (const role of roles) {
      if (typeof role !== 'string' || !['ADMIN', 'USR'].includes(role)) {
        errors.roles = 'Los roles permitidos son: ADMIN, USR.';
        break;
      }
    }
  }

  if (Object.keys(errors).length > 0) {
    return validationFailure<SetRolesRequest>(errors);
  }

  return validationSuccess<SetRolesRequest>({ roles: roles as string[] });
}

export interface UpdateEmailRequest {
  email: string;
}

export function validateUpdateEmailRequest(body: unknown): ValidationResult<UpdateEmailRequest> {
  const errors: Record<string, string> = {};
  const data = (body ?? {}) as Record<string, unknown>;

  const email = typeof data.email === 'string' ? data.email.trim() : '';

  if (!email) {
    errors.email = 'El correo electrónico es obligatorio.';
  } else if (!EMAIL_PATTERN.test(email)) {
    errors.email = 'El correo electrónico no tiene un formato válido.';
  } else if (email.length > 255) {
    errors.email = 'El correo electrónico no puede superar los 255 caracteres.';
  }

  if (Object.keys(errors).length > 0) {
    return validationFailure<UpdateEmailRequest>(errors);
  }

  return validationSuccess<UpdateEmailRequest>({ email });
}