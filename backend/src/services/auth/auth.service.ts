import { pool, withTransaction, PoolClient } from '../../config/db';
import { AppError } from '../../errors/app-error';
import { ErrorCodes } from '../../errors/error-codes';
import { config } from '../../config/env';
import { RoleName } from '../../entities/role.entity';
import { User } from '../../entities/user.entity';
import { AuthUser } from '../../entities/auth-user';
import { RegisterRequest } from '../../dto/requests/auth/register.dto';
import { LoginRequest } from '../../dto/requests/auth/login.dto';
import { UserService } from '../users/user.service';
import { RoleRepository } from '../../repositories/role.repository';
import { UserRepository } from '../../repositories/user.repository';
import { RefreshTokenRepository } from '../../repositories/refresh-token.repository';
import { PasswordResetTokenRepository } from '../../repositories/password-reset-token.repository';
import { CategoriaIngresoRepository } from '../../repositories/categoria-ingreso.repository';
import { CategoriaGastoRepository } from '../../repositories/categoria-gasto.repository';
import { hashPassword, comparePassword } from '../../utils/password.utils';
import { toAuthUser } from '../../mappers/user.mapper';
import {
  generateRawToken,
  hashToken,
  PASSWORD_RESET_TOKEN_TTL_MS,
  parseDurationToMs,
} from '../../utils/token.utils';
import { GoogleIdTokenPayload, verifyGoogleIdToken } from '../../utils/auth0.utils';

const DEFAULT_REGISTER_ROLE: RoleName = 'USR';

export interface SessionTokens {
  /** Id del registro en `refresh_tokens` que representa la sesión activa. */
  sessionId: string;
  refreshToken: string;
  refreshTokenExpiresAt: Date;
}

export class AuthService {
  private readonly userService: UserService;
  private readonly verifyGoogleIdToken: (idToken: string) => Promise<GoogleIdTokenPayload>;

  constructor(deps?: { verifyGoogleIdToken?: (idToken: string) => Promise<GoogleIdTokenPayload> }) {
    this.userService = new UserService(pool);
    this.verifyGoogleIdToken = deps?.verifyGoogleIdToken ?? verifyGoogleIdToken;
  }

  async register(data: RegisterRequest): Promise<{ user: User; roles: RoleName[] }> {
    const existing = await this.userService.getUserByEmailWithRoles(data.email);
    if (existing) {
      throw new AppError(ErrorCodes.EMAIL_ALREADY_REGISTERED, {
        message: 'Ya existe una cuenta registrada con ese correo electrónico.',
        statusCode: 409,
      });
    }

    const passwordHash = await hashPassword(data.password);

    return withTransaction(async (client) => {
      const userRepository = new UserRepository(client);
      const user = await userRepository.create({ email: data.email, passwordHash });
      return this.finishAccountCreation(client, user);
    });
  }

  /**
   * Autentica (o registra, si no existe) a un usuario mediante un ID Token de
   * Google emitido por Auth0. Reutiliza exactamente el mismo mecanismo de
   * sesión (JWT + refresh token) que el login tradicional.
   */
  async loginWithGoogle(idToken: string): Promise<{ authUser: AuthUser; user: User } & SessionTokens> {
    const payload = await this.verifyGoogleIdToken(idToken);

    if (payload.emailVerified === false) {
      throw new AppError(ErrorCodes.GOOGLE_EMAIL_NOT_VERIFIED, {
        message: 'El correo de tu cuenta de Google no está verificado.',
        statusCode: 403,
      });
    }

    const account = await this.resolveGoogleAccount(payload);

    if (!account.user.isActive) {
      throw new AppError(ErrorCodes.ACCOUNT_DISABLED, {
        message: 'La cuenta está desactivada. Contacta al administrador.',
        statusCode: 403,
      });
    }

    const tokens = await this.issueRefreshToken(account.user.id);

    return {
      authUser: toAuthUser(account.user, account.roles),
      user: account.user,
      ...tokens,
    };
  }

  /**
   * Determina si el `sub` de Google ya corresponde a un usuario (login), si el
   * correo ya existe por el método tradicional (vincula la cuenta) o si debe
   * crearse un usuario nuevo (registro), usando siempre `sub` como
   * identificador estable y el correo solo como mecanismo de vinculación.
   */
  private async resolveGoogleAccount(
    payload: GoogleIdTokenPayload,
  ): Promise<{ user: User; roles: RoleName[] }> {
    const userRepository = new UserRepository(pool);

    const byGoogleSub = await userRepository.findByGoogleSub(payload.sub);
    if (byGoogleSub) {
      const roles = await new RoleRepository(pool).findRolesByUserId(byGoogleSub.id);
      return { user: byGoogleSub, roles };
    }

    if (!payload.email) {
      throw new AppError(ErrorCodes.GOOGLE_TOKEN_INVALID, {
        message: 'No se pudo obtener el correo electrónico de la cuenta de Google.',
        statusCode: 401,
      });
    }

    const byEmail = await this.userService.getUserByEmailWithRoles(payload.email);
    if (byEmail) {
      const linked = await userRepository.linkGoogleSub(byEmail.user.id, payload.sub);
      return { user: linked ?? byEmail.user, roles: byEmail.roles };
    }

    const email = payload.email;
    return withTransaction(async (client) => {
      const userRepo = new UserRepository(client);
      const user = await userRepo.createGoogleUser({ email, googleSub: payload.sub });
      return this.finishAccountCreation(client, user);
    });
  }

  /** Asigna el rol y las categorías por defecto a un usuario recién creado (tradicional o Google). */
  private async finishAccountCreation(
    client: PoolClient,
    user: User,
  ): Promise<{ user: User; roles: RoleName[] }> {
    const roleRepository = new RoleRepository(client);
    const categoriaIngresoRepository = new CategoriaIngresoRepository(client);
    const categoriaGastoRepository = new CategoriaGastoRepository(client);

    const role = await roleRepository.findByName(DEFAULT_REGISTER_ROLE);
    if (!role) {
      throw new AppError(ErrorCodes.INTERNAL_ERROR, {
        message: 'El rol por defecto del sistema no está configurado.',
        statusCode: 500,
      });
    }

    await roleRepository.assignToUser(user.id, role.id);
    await categoriaIngresoRepository.createDefaultsForUser(user.id);
    await categoriaGastoRepository.createDefaultsForUser(user.id);

    return { user, roles: [role.name] };
  }

  async login(data: LoginRequest): Promise<{ authUser: AuthUser; user: User } & SessionTokens> {
    const account = await this.userService.getUserByEmailWithRoles(data.email);
    if (!account || account.user.deletedAt || !account.user.passwordHash) {
      throw this.invalidCredentials();
    }

    const passwordMatches = await comparePassword(data.password, account.user.passwordHash);
    if (!passwordMatches) {
      throw this.invalidCredentials();
    }

    if (!account.user.isActive) {
      throw new AppError(ErrorCodes.ACCOUNT_DISABLED, {
        message: 'La cuenta está desactivada. Contacta al administrador.',
        statusCode: 403,
      });
    }

    const tokens = await this.issueRefreshToken(account.user.id);

    return {
      authUser: toAuthUser(account.user, account.roles),
      user: account.user,
      ...tokens,
    };
  }

  async refresh(rawToken: string): Promise<{ authUser: AuthUser; user: User } & SessionTokens> {
    const repository = new RefreshTokenRepository(pool);
    const tokenHash = hashToken(rawToken);
    const record = await repository.findByTokenHash(tokenHash);

    if (!record || record.revokedAt) {
      throw new AppError(ErrorCodes.REFRESH_TOKEN_INVALID, {
        message: 'El token de refresco no es válido.',
        statusCode: 401,
      });
    }

    if (new Date(record.expiresAt).getTime() <= Date.now()) {
      throw new AppError(ErrorCodes.REFRESH_TOKEN_EXPIRED, {
        message: 'El token de refresco ha expirado. Vuelve a iniciar sesión.',
        statusCode: 401,
      });
    }

    const idleMs = Date.now() - new Date(record.lastUsedAt).getTime();
    if (idleMs > config.sessionIdleTimeoutMs) {
      await repository.revoke(record.id);
      throw new AppError(ErrorCodes.SESSION_IDLE_EXPIRED, {
        message: 'La sesión ha expirado por inactividad. Vuelve a iniciar sesión.',
        statusCode: 401,
      });
    }

    const account = await this.userService.getUserWithRoles(record.userId);
    if (!account) {
      throw new AppError(ErrorCodes.REFRESH_TOKEN_INVALID, {
        message: 'El token de refresco no es válido.',
        statusCode: 401,
      });
    }
    if (!account.user.isActive) {
      throw new AppError(ErrorCodes.ACCOUNT_DISABLED, {
        message: 'La cuenta está desactivada. Contacta al administrador.',
        statusCode: 403,
      });
    }

    await repository.revoke(record.id);
    const tokens = await this.issueRefreshToken(account.user.id);

    return {
      authUser: toAuthUser(account.user, account.roles),
      user: account.user,
      ...tokens,
    };
  }

  async revokeAllRefreshTokens(userId: string): Promise<void> {
    const repository = new RefreshTokenRepository(pool);
    await repository.revokeAllByUserId(userId);
  }

  async issueRefreshToken(userId: string): Promise<SessionTokens> {
    const repository = new RefreshTokenRepository(pool);
    const rawToken = generateRawToken();
    const now = new Date();
    const expiresAt = new Date(now.getTime() + parseDurationToMs(config.jwtRefreshExpiresIn));

    const record = await repository.create({
      userId,
      tokenHash: hashToken(rawToken),
      expiresAt,
      lastUsedAt: now,
    });

    return {
      sessionId: record.id,
      refreshToken: rawToken,
      refreshTokenExpiresAt: expiresAt,
    };
  }

  async requestPasswordReset(email: string): Promise<{ requested: boolean; resetToken: string | null }> {
    const account = await this.userService.getUserByEmailWithRoles(email);
    if (!account || account.user.deletedAt) {
      return { requested: false, resetToken: null };
    }
    if (!account.user.isActive) {
      return { requested: false, resetToken: null };
    }

    const repository = new PasswordResetTokenRepository(pool);
    const rawToken = generateRawToken();
    const expiresAt = new Date(Date.now() + PASSWORD_RESET_TOKEN_TTL_MS);

    await repository.create({
      userId: account.user.id,
      tokenHash: hashToken(rawToken),
      expiresAt,
    });

    if (config.nodeEnv === 'development') {
      console.log(`[password-reset] token para ${account.user.email}: ${rawToken}`);
    }

    return { requested: true, resetToken: config.nodeEnv === 'development' ? rawToken : null };
  }

  async resetPassword(rawToken: string, newPassword: string): Promise<void> {
    const repository = new PasswordResetTokenRepository(pool);
    const tokenHash = hashToken(rawToken);
    const record = await repository.findByTokenHash(tokenHash);

    if (!record || record.usedAt) {
      throw new AppError(ErrorCodes.RECOVERY_TOKEN_INVALID, {
        message: 'El token de recuperación no es válido.',
        statusCode: 401,
      });
    }

    if (new Date(record.expiresAt).getTime() <= Date.now()) {
      throw new AppError(ErrorCodes.RECOVERY_TOKEN_EXPIRED, {
        message: 'El token de recuperación ha expirado. Solicita uno nuevo.',
        statusCode: 401,
      });
    }

    const passwordHash = await hashPassword(newPassword);
    await this.userService.updatePassword(record.userId, passwordHash);
    await repository.markUsed(record.id);
    await this.revokeAllRefreshTokens(record.userId);
  }

  private invalidCredentials(): AppError {
    return new AppError(ErrorCodes.INVALID_CREDENTIALS, {
      message: 'Credenciales incorrectas.',
      statusCode: 401,
    });
  }
}