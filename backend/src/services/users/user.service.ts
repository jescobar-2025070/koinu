import { Db, withTransaction } from '../../config/db';
import { UserRepository } from '../../repositories/user.repository';
import { RoleRepository } from '../../repositories/role.repository';
import { RefreshTokenRepository } from '../../repositories/refresh-token.repository';
import { CategoriaIngresoRepository } from '../../repositories/categoria-ingreso.repository';
import { CategoriaGastoRepository } from '../../repositories/categoria-gasto.repository';
import { User } from '../../entities/user.entity';
import { RoleName } from '../../entities/role.entity';
import { AppError } from '../../errors/app-error';
import { ErrorCodes } from '../../errors/error-codes';
import { hashPassword } from '../../utils/password.utils';

const DEFAULT_USER_ROLE: RoleName = 'USR';

export class UserService {
  private readonly userRepository: UserRepository;
  private readonly roleRepository: RoleRepository;
  private readonly db: Db;

  constructor(db: Db) {
    this.db = db;
    this.userRepository = new UserRepository(db);
    this.roleRepository = new RoleRepository(db);
  }

  async getUserWithRoles(id: string): Promise<{ user: User; roles: RoleName[] } | null> {
    const user = await this.userRepository.findById(id);
    if (!user || user.deletedAt) {
      return null;
    }
    const roles = await this.roleRepository.findRolesByUserId(user.id);
    return { user, roles };
  }

  async getUserByEmailWithRoles(
    email: string,
  ): Promise<{ user: User; roles: RoleName[] } | null> {
    const user = await this.userRepository.findByEmail(email);
    if (!user) {
      return null;
    }
    const roles = await this.roleRepository.findRolesByUserId(user.id);
    return { user, roles };
  }

  async updatePassword(userId: string, passwordHash: string): Promise<void> {
    const updated = await this.userRepository.updatePassword(userId, passwordHash);
    if (!updated) {
      throw new AppError(ErrorCodes.USER_NOT_FOUND, {
        message: 'Usuario no encontrado.',
        statusCode: 404,
      });
    }
  }

  async listUsers(): Promise<{ user: User; roles: RoleName[] }[]> {
    const users = await this.userRepository.findAll();
    return Promise.all(
      users.map(async (user) => {
        const roles = await this.roleRepository.findRolesByUserId(user.id);
        return { user, roles };
      }),
    );
  }

  async createUser(data: {
    email: string;
    password: string;
    roles?: RoleName[];
  }): Promise<{ user: User; roles: RoleName[] }> {
    const existing = await this.userRepository.findByEmail(data.email);
    if (existing) {
      throw new AppError(ErrorCodes.EMAIL_ALREADY_REGISTERED, {
        message: 'Ya existe una cuenta registrada con ese correo electrónico.',
        statusCode: 409,
      });
    }

    const passwordHash = await hashPassword(data.password);
    const roleNames = data.roles && data.roles.length > 0 ? data.roles : [DEFAULT_USER_ROLE];

    return withTransaction(async (client) => {
      const userRepo = new UserRepository(client);
      const roleRepo = new RoleRepository(client);

      const user = await userRepo.create({ email: data.email, passwordHash });

      for (const roleName of roleNames) {
        const role = await roleRepo.findByName(roleName);
        if (role) {
          await roleRepo.assignToUser(user.id, role.id);
        }
      }

      const categoriaIngresoRepository = new CategoriaIngresoRepository(client);
      const categoriaGastoRepository = new CategoriaGastoRepository(client);
      await categoriaIngresoRepository.createDefaultsForUser(user.id);
      await categoriaGastoRepository.createDefaultsForUser(user.id);

      return { user, roles: roleNames };
    });
  }

  async updateUserEmail(userId: string, email: string): Promise<{ user: User; roles: RoleName[] }> {
    const existing = await this.userRepository.findByEmail(email);
    if (existing && existing.id !== userId) {
      throw new AppError(ErrorCodes.EMAIL_ALREADY_REGISTERED, {
        message: 'Ya existe una cuenta registrada con ese correo electrónico.',
        statusCode: 409,
      });
    }

    const updated = await this.userRepository.updateEmail(userId, email);
    if (!updated) {
      throw new AppError(ErrorCodes.USER_NOT_FOUND, {
        message: 'Usuario no encontrado.',
        statusCode: 404,
      });
    }
    const roles = await this.roleRepository.findRolesByUserId(updated.id);
    return { user: updated, roles };
  }

  async resetUserPassword(userId: string, password: string): Promise<void> {
    const user = await this.userRepository.findById(userId);
    if (!user || user.deletedAt) {
      throw new AppError(ErrorCodes.USER_NOT_FOUND, {
        message: 'Usuario no encontrado.',
        statusCode: 404,
      });
    }

    const passwordHash = await hashPassword(password);
    const updated = await this.userRepository.updatePassword(userId, passwordHash);
    if (!updated) {
      throw new AppError(ErrorCodes.USER_NOT_FOUND, {
        message: 'Usuario no encontrado.',
        statusCode: 404,
      });
    }

    const refreshTokenRepo = new RefreshTokenRepository(this.db);
    await refreshTokenRepo.revokeAllByUserId(userId);
  }

  async setUserActive(userId: string, isActive: boolean): Promise<{ user: User; roles: RoleName[] }> {
    const updated = await this.userRepository.setActive(userId, isActive);
    if (!updated) {
      throw new AppError(ErrorCodes.USER_NOT_FOUND, {
        message: 'Usuario no encontrado.',
        statusCode: 404,
      });
    }
    const roles = await this.roleRepository.findRolesByUserId(updated.id);
    return { user: updated, roles };
  }

  async setUserRoles(userId: string, roleNames: RoleName[]): Promise<{ user: User; roles: RoleName[] }> {
    const validRoles = await this.roleRepository.findAll();
    const validNames = new Set(validRoles.map((role) => role.name));

    for (const roleName of roleNames) {
      if (!validNames.has(roleName)) {
        throw new AppError(ErrorCodes.ROLE_NOT_FOUND, {
          message: `El rol "${roleName}" no existe.`,
          statusCode: 404,
        });
      }
    }

    return withTransaction(async (client) => {
      const userRepo = new UserRepository(client);
      const roleRepo = new RoleRepository(client);

      const user = await userRepo.findById(userId);
      if (!user || user.deletedAt) {
        throw new AppError(ErrorCodes.USER_NOT_FOUND, {
          message: 'Usuario no encontrado.',
          statusCode: 404,
        });
      }

      await roleRepo.removeAllFromUser(userId);
      for (const roleName of roleNames) {
        const role = await roleRepo.findByName(roleName);
        if (role) {
          await roleRepo.assignToUser(userId, role.id);
        }
      }

      return { user, roles: roleNames };
    });
  }

  async softDeleteUser(userId: string, actorId: string): Promise<void> {
    if (userId === actorId) {
      throw new AppError(ErrorCodes.CANNOT_DELETE_SELF, {
        message: 'No puedes eliminar tu propia cuenta.',
        statusCode: 422,
      });
    }

    const deleted = await this.userRepository.softDelete(userId);
    if (!deleted) {
      throw new AppError(ErrorCodes.USER_NOT_FOUND, {
        message: 'Usuario no encontrado.',
        statusCode: 404,
      });
    }
  }
}