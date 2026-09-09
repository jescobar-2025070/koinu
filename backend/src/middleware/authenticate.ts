import { Request, Response, NextFunction } from 'express';
import jwt, { JsonWebTokenError, TokenExpiredError } from 'jsonwebtoken';
import { config } from '../config/env';
import { AppError } from '../errors/app-error';
import { ErrorCodes } from '../errors/error-codes';
import { pool } from '../config/db';
import { RefreshTokenRepository } from '../repositories/refresh-token.repository';
import { UserService } from '../services/users/user.service';
import { toAuthUser } from '../mappers/user.mapper';

const userService = new UserService(pool);
const refreshTokenRepository = new RefreshTokenRepository(pool);

function extractToken(req: Request): string | null {
  const cookieToken = req.cookies?.[config.cookieName];
  if (typeof cookieToken === 'string' && cookieToken.length > 0) {
    return cookieToken;
  }

  const header = req.headers.authorization;
  if (typeof header === 'string' && header.startsWith('Bearer ')) {
    return header.slice('Bearer '.length).trim();
  }

  return null;
}

export function authenticate(req: Request, _res: Response, next: NextFunction): void {
  const token = extractToken(req);
  if (!token) {
    next(
      new AppError(ErrorCodes.UNAUTHORIZED, {
        message: 'Autenticación requerida.',
        statusCode: 401,
      }),
    );
    return;
  }

  let payload: jwt.JwtPayload;
  try {
    payload = jwt.verify(token, config.jwtSecret) as jwt.JwtPayload;
  } catch (error) {
    if (error instanceof TokenExpiredError) {
      next(
        new AppError(ErrorCodes.TOKEN_EXPIRED, {
          message: 'La sesión ha expirado. Inicia sesión nuevamente.',
          statusCode: 401,
        }),
      );
      return;
    }
    if (error instanceof JsonWebTokenError) {
      next(
        new AppError(ErrorCodes.TOKEN_INVALID, {
          message: 'El token de autenticación no es válido.',
          statusCode: 401,
        }),
      );
      return;
    }
    next(error);
    return;
  }

  const userId = payload.sub;
  if (!userId) {
    next(
      new AppError(ErrorCodes.TOKEN_INVALID, {
        message: 'El token de autenticación no es válido.',
        statusCode: 401,
      }),
    );
    return;
  }

  const sessionId = payload.sid;
  if (!sessionId) {
    next(
      new AppError(ErrorCodes.TOKEN_INVALID, {
        message: 'El token de autenticación no es válido.',
        statusCode: 401,
      }),
    );
    return;
  }

  void (async () => {
    const account = await userService.getUserWithRoles(userId);
    if (!account) {
      next(
        new AppError(ErrorCodes.TOKEN_INVALID, {
          message: 'El token de autenticación no es válido.',
          statusCode: 401,
        }),
      );
      return;
    }

    const session = await refreshTokenRepository.findById(sessionId);
    if (!session || session.revokedAt) {
      next(
        new AppError(ErrorCodes.TOKEN_INVALID, {
          message: 'La sesión ya no es válida. Vuelve a iniciar sesión.',
          statusCode: 401,
        }),
      );
      return;
    }

    if (new Date(session.expiresAt).getTime() <= Date.now()) {
      next(
        new AppError(ErrorCodes.REFRESH_TOKEN_EXPIRED, {
          message: 'La sesión ha expirado. Vuelve a iniciar sesión.',
          statusCode: 401,
        }),
      );
      return;
    }

    const idleMs = Date.now() - new Date(session.lastUsedAt).getTime();
    if (idleMs > config.sessionIdleTimeoutMs) {
      next(
        new AppError(ErrorCodes.SESSION_IDLE_EXPIRED, {
          message: 'La sesión ha expirado por inactividad. Vuelve a iniciar sesión.',
          statusCode: 401,
        }),
      );
      return;
    }

    await refreshTokenRepository.updateLastUsedAt(sessionId, new Date());
    req.user = toAuthUser(account.user, account.roles);
    next();
  })().catch(next);
}