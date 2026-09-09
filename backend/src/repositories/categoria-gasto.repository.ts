import { Db } from '../config/db';
import { CategoriaGasto } from '../entities/categoria-gasto.entity';

interface CategoriaRow {
  id: string;
  user_id: string | null;
  name: string;
  is_default: boolean;
  is_active: boolean;
  created_at: Date;
}

function mapRow(row: CategoriaRow): CategoriaGasto {
  return {
    id: row.id,
    userId: row.user_id,
    name: row.name,
    isDefault: row.is_default,
    isActive: row.is_active,
    createdAt: row.created_at,
  };
}

export class CategoriaGastoRepository {
  constructor(private readonly db: Db) {}

  async findByUser(userId: string): Promise<CategoriaGasto[]> {
    const result = await this.db.query<CategoriaRow>(
      `SELECT id, user_id, name, is_default, is_active, created_at
         FROM categorias_gasto
        WHERE is_active = TRUE AND user_id = $1
        ORDER BY name ASC`,
      [userId],
    );
    return result.rows.map(mapRow);
  }

  async findById(id: string): Promise<CategoriaGasto | null> {
    const result = await this.db.query<CategoriaRow>(
      `SELECT id, user_id, name, is_default, is_active, created_at
         FROM categorias_gasto
        WHERE id = $1
        LIMIT 1`,
      [id],
    );
    return result.rows[0] ? mapRow(result.rows[0]) : null;
  }

  async findActiveByName(userId: string, name: string): Promise<CategoriaGasto | null> {
    const result = await this.db.query<CategoriaRow>(
      `SELECT id, user_id, name, is_default, is_active, created_at
         FROM categorias_gasto
        WHERE user_id = $1 AND is_active = TRUE AND LOWER(name) = LOWER($2)
        LIMIT 1`,
      [userId, name],
    );
    return result.rows[0] ? mapRow(result.rows[0]) : null;
  }

  async create(data: { userId: string; name: string }): Promise<CategoriaGasto> {
    const result = await this.db.query<CategoriaRow>(
      `INSERT INTO categorias_gasto (user_id, name, is_default)
       VALUES ($1, $2, FALSE)
       RETURNING id, user_id, name, is_default, is_active, created_at`,
      [data.userId, data.name],
    );
    return mapRow(result.rows[0]);
  }

  async update(id: string, name: string): Promise<CategoriaGasto | null> {
    const result = await this.db.query<CategoriaRow>(
      `UPDATE categorias_gasto
          SET name = $2
        WHERE id = $1
        RETURNING id, user_id, name, is_default, is_active, created_at`,
      [id, name],
    );
    return result.rows[0] ? mapRow(result.rows[0]) : null;
  }

  async softDelete(id: string): Promise<boolean> {
    const result = await this.db.query(
      `UPDATE categorias_gasto
          SET is_active = FALSE
        WHERE id = $1`,
      [id],
    );
    return (result.rowCount ?? 0) > 0;
  }

  async createDefaultsForUser(userId: string): Promise<void> {
    await this.db.query(
      `INSERT INTO categorias_gasto (user_id, name, is_default)
       SELECT $1, name, FALSE
         FROM categorias_gasto source
        WHERE source.user_id IS NULL AND source.is_default = TRUE
          AND NOT EXISTS (
            SELECT 1 FROM categorias_gasto existing
             WHERE existing.user_id = $1 AND LOWER(existing.name) = LOWER(source.name)
          )`,
      [userId],
    );
  }
}
