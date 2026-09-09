import { Request, Response, NextFunction } from 'express';
import { UserService } from '../services/users/user.service';
import { pool } from '../config/db';
import { AppError } from '../errors/app-error';
import { ErrorCodes } from '../errors/error-codes';
import { toUserResponse } from '../mappers/user.mapper';
import { RoleName } from '../entities/role.entity';

export class UserController {
  private readonly userService: UserService;

  constructor() {
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

  list = async (_req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const users = await this.userService.listUsers();
      res.status(200).json({
        users: users.map(({ user, roles }) => toUserResponse(user, roles)),
      });
    } catch (error) {
      next(error);
    }
  };

  create = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const { user, roles } = await this.userService.createUser(req.body);
      res.status(201).json({ user: toUserResponse(user, roles) });
    } catch (error) {
      next(error);
    }
  };

  getById = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const result = await this.userService.getUserWithRoles(req.params.id);
      if (!result) {
        throw new AppError(ErrorCodes.USER_NOT_FOUND, {
          message: 'Usuario no encontrado.',
          statusCode: 404,
        });
      }
      res.status(200).json({ user: toUserResponse(result.user, result.roles) });
    } catch (error) {
      next(error);
    }
  };

  updateEmail = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const { user, roles } = await this.userService.updateUserEmail(req.params.id, req.body.email);
      res.status(200).json({ user: toUserResponse(user, roles) });
    } catch (error) {
      next(error);
    }
  };

  resetPassword = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      await this.userService.resetUserPassword(req.params.id, req.body.password);
      res.status(204).end();
    } catch (error) {
      next(error);
    }
  };

  setActive = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const userId = this.requireUser(req);
      if (req.params.id === userId) {
        throw new AppError(ErrorCodes.CANNOT_DELETE_SELF, {
          message: 'No puedes desactivar tu propia cuenta.',
          statusCode: 422,
        });
      }
      const { user, roles } = await this.userService.setUserActive(req.params.id, req.body.isActive);
      res.status(200).json({ user: toUserResponse(user, roles) });
    } catch (error) {
      next(error);
    }
  };

  setRoles = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const { user, roles } = await this.userService.setUserRoles(req.params.id, req.body.roles as RoleName[]);
      res.status(200).json({ user: toUserResponse(user, roles) });
    } catch (error) {
      next(error);
    }
  };

  delete = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const actorId = this.requireUser(req);
      await this.userService.softDeleteUser(req.params.id, actorId);
      res.status(204).end();
    } catch (error) {
      next(error);
    }
  };
}