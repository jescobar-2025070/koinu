import jwt from 'jsonwebtoken';
import jwksClient, { JwksClient } from 'jwks-rsa';
import { config } from '../config/env';
import { AppError } from '../errors/app-error';
import { ErrorCodes } from '../errors/error-codes';

export interface GoogleIdTokenPayload {
  sub: string;
  email?: string;
  emailVerified?: boolean;
  name?: string;
  picture?: string;
}

let cachedClient: JwksClient | null = null;

function getJwksClient(): JwksClient {
  if (!cachedClient) {
    cachedClient = jwksClient({
      jwksUri: `https://${config.auth0Domain}/.well-known/jwks.json`,
      cache: true,
      cacheMaxAge: 10 * 60 * 1000,
      rateLimit: true,
    });
  }
  return cachedClient;
}

function getSigningKey(header: jwt.JwtHeader, callback: jwt.SigningKeyCallback): void {
  if (!header.kid) {
    callback(new Error('El token no incluye un identificador de clave (kid).'));
    return;
  }
  getJwksClient().getSigningKey(header.kid, (err, key) => {
    if (err || !key) {
      callback(err ?? new Error('No se pudo obtener la clave pública de Auth0.'));
      return;
    }
    callback(null, key.getPublicKey());
  });
}

function invalidTokenError(): AppError {
  return new AppError(ErrorCodes.GOOGLE_TOKEN_INVALID, {
    message: 'El token de Google/Auth0 no es válido o expiró.',
    statusCode: 401,
  });
}

/**
 * Verifica un ID Token emitido por Auth0 (conexión de Google): firma (JWKS/RS256),
 * issuer y audience. Lanza AppError si la verificación falla o si Auth0 no está
 * configurado en el servidor.
 */
export function verifyGoogleIdToken(idToken: string): Promise<GoogleIdTokenPayload> {
  if (!config.auth0Domain || !config.auth0ClientId) {
    return Promise.reject(
      new AppError(ErrorCodes.GOOGLE_AUTH_NOT_CONFIGURED, {
        message: 'La autenticación con Google no está configurada en el servidor.',
        statusCode: 500,
      }),
    );
  }

  if (typeof idToken !== 'string' || idToken.length === 0) {
    return Promise.reject(invalidTokenError());
  }

  return new Promise((resolve, reject) => {
    jwt.verify(
      idToken,
      getSigningKey,
      {
        algorithms: ['RS256'],
        issuer: `https://${config.auth0Domain}/`,
        audience: config.auth0ClientId,
      },
      (err, decoded) => {
        if (err || !decoded || typeof decoded === 'string') {
          reject(invalidTokenError());
          return;
        }

        const payload = decoded as jwt.JwtPayload;
        if (!payload.sub) {
          reject(invalidTokenError());
          return;
        }

        resolve({
          sub: payload.sub,
          email: typeof payload['email'] === 'string' ? payload['email'] : undefined,
          emailVerified:
            typeof payload['email_verified'] === 'boolean' ? payload['email_verified'] : undefined,
          name: typeof payload['name'] === 'string' ? payload['name'] : undefined,
          picture: typeof payload['picture'] === 'string' ? payload['picture'] : undefined,
        });
      },
    );
  });
}
