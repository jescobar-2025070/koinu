import { Request, Response, NextFunction } from 'express';
import { AuthService } from '../services/auth/auth.service';
import { UserService } from '../services/users/user.service';
import { pool } from '../config/db';
import { AppError } from '../errors/app-error';
import { ErrorCodes } from '../errors/error-codes';
import { signAuthToken } from '../utils/jwt.utils';
import { setAuthCookie, clearAuthCookie } from '../utils/cookie.utils';
import { toUserResponse } from '../mappers/user.mapper';
import { config } from '../config/env';

export class AuthController {
  private readonly authService: AuthService;
  private readonly userService: UserService;

  constructor() {
    this.authService = new AuthService();
    this.userService = new UserService(pool);
  }

  private requireUser(req: Request): string {
    if (!req.user) {
      throw new AppError(ErrorCodes.UNAUTHORIZED, {
        message: 'Autenticación requerida.',
        statusCode: 401,
      });
    }
    return req.user.id;
  }

  register = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const { user, roles } = await this.authService.register(req.body);
      res.status(201).json({ user: toUserResponse(user, roles) });
    } catch (error) {
      next(error);
    }
  };

  login = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const { authUser, user, refreshToken, refreshTokenExpiresAt } = await this.authService.login(req.body);
      setAuthCookie(res, signAuthToken(authUser));
      res.status(200).json({
        user: toUserResponse(user, authUser.roles),
        refreshToken,
        refreshTokenExpiresAt,
      });
    } catch (error) {
      next(error);
    }
  };

  google = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const { authUser, user, refreshToken, refreshTokenExpiresAt } = await this.authService.loginWithGoogle(
        req.body.idToken,
      );
      setAuthCookie(res, signAuthToken(authUser));
      res.status(200).json({
        user: toUserResponse(user, authUser.roles),
        refreshToken,
        refreshTokenExpiresAt,
      });
    } catch (error) {
      next(error);
    }
  };

  refresh = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const { authUser, user, refreshToken, refreshTokenExpiresAt } = await this.authService.refresh(
        req.body.refreshToken,
      );
      setAuthCookie(res, signAuthToken(authUser));
      res.status(200).json({
        user: toUserResponse(user, authUser.roles),
        refreshToken,
        refreshTokenExpiresAt,
      });
    } catch (error) {
      next(error);
    }
  };

  logout = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      if (req.user) {
        await this.authService.revokeAllRefreshTokens(req.user.id);
      }
      clearAuthCookie(res);
      res.status(204).end();
    } catch (error) {
      next(error);
    }
  };

  me = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const userId = this.requireUser(req);
      const account = await this.userService.getUserWithRoles(userId);
      if (!account) {
        throw new AppError(ErrorCodes.TOKEN_INVALID, {
          message: 'La sesión ya no es válida.',
          statusCode: 401,
        });
      }
      res.status(200).json({ user: toUserResponse(account.user, account.roles) });
    } catch (error) {
      next(error);
    }
  };

  forgotPassword = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const { requested, resetToken } = await this.authService.requestPasswordReset(req.body.email);
      res.status(200).json({
        message: requested
          ? 'Si el correo está registrado, recibirás un enlace para restablecer tu contraseña.'
          : 'No se encontró una cuenta activa con ese correo.',
        resetToken: config.nodeEnv === 'development' ? resetToken : undefined,
      });
    } catch (error) {
      next(error);
    }
  };

  resetPassword = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      await this.authService.resetPassword(req.body.token, req.body.password);
      res.status(200).json({ message: 'Contraseña actualizada correctamente.' });
    } catch (error) {
      next(error);
    }
  };
}