import { GoogleAuthRequest } from '../../dto/requests/auth/google.dto';
import { ValidationResult, validationFailure, validationSuccess } from '../validator-result';

export function validateGoogleAuthRequest(body: unknown): ValidationResult<GoogleAuthRequest> {
  const errors: Record<string, string> = {};
  const data = (body ?? {}) as Record<string, unknown>;

  const idToken = typeof data.idToken === 'string' ? data.idToken.trim() : '';

  if (!idToken) {
    errors.idToken = 'El token de Google (idToken) es obligatorio.';
  }

  if (Object.keys(errors).length > 0) {
    return validationFailure<GoogleAuthRequest>(errors);
  }

  return validationSuccess<GoogleAuthRequest>({ idToken });
}
