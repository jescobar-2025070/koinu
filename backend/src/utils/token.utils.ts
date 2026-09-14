import crypto from 'crypto';

export const PASSWORD_RESET_TOKEN_TTL_MS = 60 * 60 * 1000;

export function generateRawToken(): string {
  return crypto.randomBytes(48).toString('base64url');
}

export function hashToken(rawToken: string): string {
  return crypto.createHash('sha256').update(rawToken).digest('hex');
}

/** Convierte una duración legible (p.ej. "30m", "2h", "7d", "5000") a milisegundos. */
export function parseDurationToMs(value: string): number {
  const trimmed = value.trim().toLowerCase();
  const match = /^(\d+(?:\.\d+)?)\s*(ms|s|m|h|d)?$/.exec(trimmed);
  if (!match) {
    throw new Error(`Duración inválida: "${value}". Usa un formato como 30m, 2h, 7d o 5000.`);
  }

  const amount = Number(match[1]);
  const unit = match[2] ?? 'ms';
  const multipliers: Record<string, number> = {
    ms: 1,
    s: 1000,
    m: 60 * 1000,
    h: 60 * 60 * 1000,
    d: 24 * 60 * 60 * 1000,
  };

  return Math.round(amount * multipliers[unit]);
}