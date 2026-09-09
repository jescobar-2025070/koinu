import { Db } from '../config/db';
import { Periodo, PeriodoStatus } from '../entities/periodo.entity';

interface PeriodoRow {
  id: string;
  user_id: string;
  name: string;
  start_date: Date;
  end_date: Date;
  status: PeriodoStatus;
  created_at: Date;
  updated_at: Date;
  deleted_at: Date | null;
}

function mapRow(row: PeriodoRow): Periodo {
  return {
    id: row.id,
    userId: row.user_id,
    name: row.name,
    startDate: row.start_date,
    endDate: row.end_date,
    status: row.status,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    deletedAt: row.deleted_at,
  };
}

interface PeriodoCreateData {
  userId: string;
  name: string;
  startDate: Date;
  endDate: Date;
  status?: PeriodoStatus;
}

export class PeriodoRepository {
  constructor(private readonly db: Db) {}

  async findByUser(userId: string): Promise<Periodo[]> {
    const result = await this.db.query<PeriodoRow>(
      `SELECT id, user_id, name, start_date, end_date, status, created_at, updated_at, deleted_at
         FROM periodos
        WHERE user_id = $1 AND deleted_at IS NULL
        ORDER BY start_date DESC`,
      [userId],
    );
    return result.rows.map(mapRow);
  }

  async findById(id: string): Promise<Periodo | null> {
    const result = await this.db.query<PeriodoRow>(
      `SELECT id, user_id, name, start_date, end_date, status, created_at, updated_at, deleted_at
         FROM periodos
        WHERE id = $1 AND deleted_at IS NULL
        LIMIT 1`,
      [id],
    );
    return result.rows[0] ? mapRow(result.rows[0]) : null;
  }

  async findByStatus(status: PeriodoStatus): Promise<Periodo[]> {
    const result = await this.db.query<PeriodoRow>(
      `SELECT id, user_id, name, start_date, end_date, status, created_at, updated_at, deleted_at
         FROM periodos
        WHERE status = $1 AND deleted_at IS NULL
        ORDER BY start_date DESC`,
      [status],
    );
    return result.rows.map(mapRow);
  }

  async findActive(userId: string): Promise<Periodo | null> {
    const result = await this.db.query<PeriodoRow>(
      `SELECT id, user_id, name, start_date, end_date, status, created_at, updated_at, deleted_at
         FROM periodos
        WHERE user_id = $1 AND status = 'ACTIVE' AND deleted_at IS NULL
        ORDER BY start_date DESC
        LIMIT 1`,
      [userId],
    );
    return result.rows[0] ? mapRow(result.rows[0]) : null;
  }

  async create(data: PeriodoCreateData): Promise<Periodo> {
    const result = await this.db.query<PeriodoRow>(
      `INSERT INTO periodos (user_id, name, start_date, end_date, status)
       VALUES ($1, $2, $3, $4, $5)
       RETURNING id, user_id, name, start_date, end_date, status, created_at, updated_at, deleted_at`,
      [data.userId, data.name, data.startDate, data.endDate, data.status ?? 'DRAFT'],
    );
    return mapRow(result.rows[0]);
  }

  async update(id: string, data: { name?: string; startDate?: Date; endDate?: Date }): Promise<Periodo | null> {
    const updates: string[] = [];
    const params: any[] = [];
    let paramIndex = 1;

    if (data.name !== undefined) {
      updates.push(`name = $${paramIndex}`);
      params.push(data.name);
      paramIndex++;
    }
    if (data.startDate !== undefined) {
      updates.push(`start_date = $${paramIndex}`);
      params.push(data.startDate);
      paramIndex++;
    }
    if (data.endDate !== undefined) {
      updates.push(`end_date = $${paramIndex}`);
      params.push(data.endDate);
      paramIndex++;
    }

    if (updates.length === 0) {
      return this.findById(id);
    }

    updates.push('updated_at = NOW()');
    params.push(id);

    const result = await this.db.query<PeriodoRow>(
      `UPDATE periodos
          SET ${updates.join(', ')}
        WHERE id = $${paramIndex} AND deleted_at IS NULL
        RETURNING id, user_id, name, start_date, end_date, status, created_at, updated_at, deleted_at`,
      params,
    );
    return result.rows[0] ? mapRow(result.rows[0]) : null;
  }

  async setStatus(id: string, status: PeriodoStatus): Promise<Periodo | null> {
    const result = await this.db.query<PeriodoRow>(
      `UPDATE periodos
          SET status = $1, updated_at = NOW()
        WHERE id = $2 AND deleted_at IS NULL
        RETURNING id, user_id, name, start_date, end_date, status, created_at, updated_at, deleted_at`,
      [status, id],
    );
    return result.rows[0] ? mapRow(result.rows[0]) : null;
  }
}
