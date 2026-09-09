import { Db } from '../config/db';
import { AuthProvider, User } from '../entities/user.entity';

const USER_COLUMNS =
  'id, email, password_hash, is_active, created_at, updated_at, deleted_at, google_sub, auth_provider';

interface UserRow {
  id: string;
  email: string;
  password_hash: string | null;
  is_active: boolean;
  created_at: Date;
  updated_at: Date;
  deleted_at: Date | null;
  google_sub: string | null;
  auth_provider: AuthProvider;
}

function mapRow(row: UserRow): User {
  return {
    id: row.id,
    email: row.email,
    passwordHash: row.password_hash,
    isActive: row.is_active,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    deletedAt: row.deleted_at,
    googleSub: row.google_sub,
    authProvider: row.auth_provider,
  };
}

export class UserRepository {
  constructor(private readonly db: Db) {}

  async findByEmail(email: string): Promise<User | null> {
    const result = await this.db.query<UserRow>(
      `SELECT ${USER_COLUMNS}
         FROM users
        WHERE email = $1
        LIMIT 1`,
      [email],
    );
    return result.rows[0] ? mapRow(result.rows[0]) : null;
  }

  async findById(id: string): Promise<User | null> {
    const result = await this.db.query<UserRow>(
      `SELECT ${USER_COLUMNS}
         FROM users
        WHERE id = $1
        LIMIT 1`,
      [id],
    );
    return result.rows[0] ? mapRow(result.rows[0]) : null;
  }

  async findByGoogleSub(googleSub: string): Promise<User | null> {
    const result = await this.db.query<UserRow>(
      `SELECT ${USER_COLUMNS}
         FROM users
        WHERE google_sub = $1
        LIMIT 1`,
      [googleSub],
    );
    return result.rows[0] ? mapRow(result.rows[0]) : null;
  }

  async create(data: { email: string; passwordHash: string }): Promise<User> {
    const result = await this.db.query<UserRow>(
      `INSERT INTO users (email, password_hash)
       VALUES ($1, $2)
       RETURNING ${USER_COLUMNS}`,
      [data.email, data.passwordHash],
    );
    return mapRow(result.rows[0]);
  }

  async createGoogleUser(data: { email: string; googleSub: string }): Promise<User> {
    const result = await this.db.query<UserRow>(
      `INSERT INTO users (email, password_hash, google_sub, auth_provider)
       VALUES ($1, NULL, $2, 'google')
       RETURNING ${USER_COLUMNS}`,
      [data.email, data.googleSub],
    );
    return mapRow(result.rows[0]);
  }

  /** Vincula una cuenta de Google (`sub`) a un usuario existente (p. ej. registrado por el método tradicional). */
  async linkGoogleSub(id: string, googleSub: string): Promise<User | null> {
    const result = await this.db.query<UserRow>(
      `UPDATE users
          SET google_sub = $2, updated_at = NOW()
        WHERE id = $1 AND deleted_at IS NULL
        RETURNING ${USER_COLUMNS}`,
      [id, googleSub],
    );
    return result.rows[0] ? mapRow(result.rows[0]) : null;
  }

  async updatePassword(id: string, passwordHash: string): Promise<User | null> {
    const result = await this.db.query<UserRow>(
      `UPDATE users
          SET password_hash = $2, updated_at = NOW()
        WHERE id = $1
        RETURNING ${USER_COLUMNS}`,
      [id, passwordHash],
    );
    return result.rows[0] ? mapRow(result.rows[0]) : null;
  }

  async updateEmail(id: string, email: string): Promise<User | null> {
    const result = await this.db.query<UserRow>(
      `UPDATE users
          SET email = $2, updated_at = NOW()
        WHERE id = $1 AND deleted_at IS NULL
        RETURNING ${USER_COLUMNS}`,
      [id, email],
    );
    return result.rows[0] ? mapRow(result.rows[0]) : null;
  }

  async setActive(id: string, isActive: boolean): Promise<User | null> {
    const result = await this.db.query<UserRow>(
      `UPDATE users
          SET is_active = $2, updated_at = NOW()
        WHERE id = $1 AND deleted_at IS NULL
        RETURNING ${USER_COLUMNS}`,
      [id, isActive],
    );
    return result.rows[0] ? mapRow(result.rows[0]) : null;
  }

  async softDelete(id: string): Promise<boolean> {
    const result = await this.db.query(
      `UPDATE users
          SET deleted_at = NOW(), is_active = FALSE, updated_at = NOW()
        WHERE id = $1 AND deleted_at IS NULL`,
      [id],
    );
    return (result.rowCount ?? 0) > 0;
  }

  async findAll(): Promise<User[]> {
    const result = await this.db.query<UserRow>(
      `SELECT ${USER_COLUMNS}
         FROM users
        WHERE deleted_at IS NULL
        ORDER BY created_at DESC`,
    );
    return result.rows.map(mapRow);
  }
}
