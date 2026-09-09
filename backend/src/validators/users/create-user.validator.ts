import { ValidationResult, validationFailure, validationSuccess } from '../validator-result';

const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const ALLOWED_ROLES = ['ADMIN', 'USR'];

export interface CreateUserRequest {
  email: string;
  password: string;
  roles: string[];
}

export function validateCreateUserRequest(body: unknown): ValidationResult<CreateUserRequest> {
  const errors: Record<string, string> = {};
  const data = (body ?? {}) as Record<string, unknown>;

  const email = typeof data.email === 'string' ? data.email.trim() : '';
  const password = typeof data.password === 'string' ? data.password : '';
  const roles = Array.isArray(data.roles) ? data.roles : [];

  if (!email) {
    errors.email = 'El correo electrónico es obligatorio.';
  } else if (!EMAIL_PATTERN.test(email)) {
    errors.email = 'El correo electrónico no tiene un formato válido.';
  } else if (email.length > 255) {
    errors.email = 'El correo electrónico no puede superar los 255 caracteres.';
  }

  if (!password) {
    errors.password = 'La contraseña es obligatoria.';
  } else if (password.length < 8) {
    errors.password = 'La contraseña debe tener al menos 8 caracteres.';
  } else if (password.length > 72) {
    errors.password = 'La contraseña no puede superar los 72 caracteres.';
  } else if (!/[A-Za-z]/.test(password) || !/\d/.test(password)) {
    errors.password = 'La contraseña debe contener al menos una letra y un número.';
  }

  for (const role of roles) {
    if (typeof role !== 'string' || !ALLOWED_ROLES.includes(role)) {
      errors.roles = 'Los roles permitidos son: ADMIN, USR.';
      break;
    }
  }

  if (Object.keys(errors).length > 0) {
    return validationFailure<CreateUserRequest>(errors);
  }

  return validationSuccess<CreateUserRequest>({ email, password, roles: roles as string[] });
}