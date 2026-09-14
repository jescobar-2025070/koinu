import { ValidationResult, validationFailure, validationSuccess } from '../validator-result';

export interface ResetUserPasswordRequest {
  password: string;
}

export function validateResetUserPasswordRequest(body: unknown): ValidationResult<ResetUserPasswordRequest> {
  const errors: Record<string, string> = {};
  const data = (body ?? {}) as Record<string, unknown>;

  const password = typeof data.password === 'string' ? data.password : '';

  if (!password) {
    errors.password = 'La contraseña es obligatoria.';
  } else if (password.length < 8) {
    errors.password = 'La contraseña debe tener al menos 8 caracteres.';
  } else if (password.length > 72) {
    errors.password = 'La contraseña no puede superar los 72 caracteres.';
  } else if (!/[A-Za-z]/.test(password) || !/\d/.test(password)) {
    errors.password = 'La contraseña debe contener al menos una letra y un número.';
  }

  if (Object.keys(errors).length > 0) {
    return validationFailure<ResetUserPasswordRequest>(errors);
  }

  return validationSuccess<ResetUserPasswordRequest>({ password });
}