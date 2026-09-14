import { Db } from '../config/db';

export interface RefreshTokenRecord {
  id: string;
  userId: string;
  tokenHash: string;
  expiresAt: Date;
  lastUsedAt: Date;
  revokedAt: Date | null;
  createdAt: Date;
}

interface RefreshTokenRow {
  id: string;
  user_id: string;
  token_hash: string;
  expires_at: Date;
  last_used_at: Date;
  revoked_at: Date | null;
  created_at: Date;
}

function mapRow(row: RefreshTokenRow): RefreshTokenRecord {
  return {
    id: row.id,
    userId: row.user_id,
    tokenHash: row.token_hash,
    expiresAt: row.expires_at,
    lastUsedAt: row.last_used_at,
    revokedAt: row.revoked_at,
    createdAt: row.created_at,
  };
}

export class RefreshTokenRepository {
  constructor(private readonly db: Db) {}

  async create(data: {
    userId: string;
    tokenHash: string;
    expiresAt: Date;
    lastUsedAt?: Date;
  }): Promise<RefreshTokenRecord> {
    const result = await this.db.query<RefreshTokenRow>(
      `INSERT INTO refresh_tokens (user_id, token_hash, expires_at, last_used_at)
       VALUES ($1, $2, $3, $4)
       RETURNING id, user_id, token_hash, expires_at, last_used_at, revoked_at, created_at`,
      [data.userId, data.tokenHash, data.expiresAt, data.lastUsedAt ?? new Date()],
    );
    return mapRow(result.rows[0]);
  }

  async findById(id: string): Promise<RefreshTokenRecord | null> {
    const result = await this.db.query<RefreshTokenRow>(
      `SELECT id, user_id, token_hash, expires_at, last_used_at, revoked_at, created_at
         FROM refresh_tokens
        WHERE id = $1
        LIMIT 1`,
      [id],
    );
    return result.rows[0] ? mapRow(result.rows[0]) : null;
  }

  async findByTokenHash(tokenHash: string): Promise<RefreshTokenRecord | null> {
    const result = await this.db.query<RefreshTokenRow>(
      `SELECT id, user_id, token_hash, expires_at, last_used_at, revoked_at, created_at
         FROM refresh_tokens
        WHERE token_hash = $1
        LIMIT 1`,
      [tokenHash],
    );
    return result.rows[0] ? mapRow(result.rows[0]) : null;
  }

  async updateLastUsedAt(id: string, at: Date): Promise<void> {
    await this.db.query(
      `UPDATE refresh_tokens
          SET last_used_at = $2
        WHERE id = $1 AND revoked_at IS NULL`,
      [id, at],
    );
  }

  async revoke(id: string): Promise<boolean> {
    const result = await this.db.query(
      `UPDATE refresh_tokens
          SET revoked_at = NOW()
        WHERE id = $1 AND revoked_at IS NULL`,
      [id],
    );
    return (result.rowCount ?? 0) > 0;
  }

  async revokeAllByUserId(userId: string): Promise<void> {
    await this.db.query(
      `UPDATE refresh_tokens
          SET revoked_at = NOW()
        WHERE user_id = $1 AND revoked_at IS NULL`,
      [userId],
    );
  }
}