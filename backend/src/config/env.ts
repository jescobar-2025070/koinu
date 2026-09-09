import dotenv from 'dotenv';
import path from 'path';
import { parseDurationToMs } from '../utils/token.utils';

const nodeEnv = process.env.NODE_ENV ?? 'development';

const envFile = nodeEnv === 'test' ? '.env.test' : '.env';
dotenv.config({ path: path.resolve(process.cwd(), envFile) });

export interface AppConfig {
  nodeEnv: string;
  isProduction: boolean;
  isTest: boolean;
  port: number;
  databaseUrl: string;
  jwtSecret: string;
  jwtExpiresIn: string;
  jwtRefreshExpiresIn: string;
  sessionIdleTimeoutMs: number;
  cookieName: string;
  cookieSecure: boolean;
  corsOrigin: string;
  bcryptRounds: number;
  auth0Domain: string;
  auth0ClientId: string;
}

function requireEnv(name: string, fallback?: string): string {
  const value = process.env[name] ?? fallback;
  if (value === undefined) {
    throw new Error(`Falta la variable de entorno obligatoria: ${name}`);
  }
  return value;
}

function toBoolean(value: string): boolean {
  return value.toLowerCase() === 'true';
}

export const config: AppConfig = {
  nodeEnv,
  isProduction: nodeEnv === 'production',
  isTest: nodeEnv === 'test',
  port: Number(process.env.PORT ?? 3000),
  databaseUrl: requireEnv('DATABASE_URL'),
  jwtSecret: requireEnv('JWT_SECRET'),
  jwtExpiresIn: requireEnv('JWT_EXPIRES_IN', '15m'),
  jwtRefreshExpiresIn: requireEnv('JWT_REFRESH_EXPIRES_IN', '7d'),
  sessionIdleTimeoutMs: parseDurationToMs(requireEnv('SESSION_IDLE_TIMEOUT', '30m')),
  cookieName: requireEnv('COOKIE_NAME', 'finanzas_auth'),
  cookieSecure: toBoolean(requireEnv('COOKIE_SECURE', 'false')),
  corsOrigin: requireEnv('CORS_ORIGIN', 'http://localhost:4200'),
  bcryptRounds: Number(requireEnv('BCRYPT_ROUNDS', '12')),
  // Opcionales: solo requeridos para habilitar el login/registro con Google.
  // Si no están configurados, /auth/google responderá con GOOGLE_AUTH_NOT_CONFIGURED
  // y el resto de la autenticación (tradicional) sigue funcionando sin cambios.
  auth0Domain: process.env.AUTH0_DOMAIN ?? '',
  auth0ClientId: process.env.AUTH0_CLIENT_ID ?? '',
};
