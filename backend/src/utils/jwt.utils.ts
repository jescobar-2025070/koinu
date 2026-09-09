import jwt from 'jsonwebtoken';
import { config } from '../config/env';
import { AuthUser } from '../entities/auth-user';

export interface JwtPayload {
  sub: string;
  email: string;
  roles: string[];
  /** Id de la sesión (registro en refresh_tokens) al que pertenece el access token. */
  sid: string;
  iat: number;
  exp: number;
}

export function signAuthToken(user: AuthUser, sessionId: string): string {
  const payload = {
    sub: user.id,
    email: user.email,
    roles: user.roles,
    sid: sessionId,
  };
  return jwt.sign(payload, config.jwtSecret, {
    expiresIn: config.jwtExpiresIn as jwt.SignOptions['expiresIn'],
  });
}

export function verifyAuthToken(token: string): JwtPayload {
  return jwt.verify(token, config.jwtSecret) as JwtPayload;
}