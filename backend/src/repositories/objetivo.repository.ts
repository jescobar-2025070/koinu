import { Db } from '../config/db';
import { Objetivo, ObjetivoPriority, ObjetivoStatus } from '../entities/objetivo.entity';

interface ObjetivoRow {
  id: string;
  user_id: string;
  periodo_id: string | null;
  name: string;
  description: string | null;
  target_amount: number;
  current_amount: number;
  deadline: Date | null;
  start_date: Date | null;
  priority: ObjetivoPriority;
  status: ObjetivoStatus;
  created_at: Date;
  updated_at: Date;
}

const COLUMNS = `id, user_id, periodo_id, name, description, target_amount, current_amount, deadline, start_date, priority, status, created_at, updated_at`;

function mapRow(row: ObjetivoRow): Objetivo {
  return {
    id: row.id,
    userId: row.user_id,
    periodoId: row.periodo_id,
    name: row.name,
    description: row.description,
    targetAmount: row.target_amount,
    currentAmount: row.current_amount,
    deadline: row.deadline,
    startDate: row.start_date,
    priority: row.priority,
    status: row.status,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

export class ObjetivoRepository {
  constructor(private readonly db: Db) {}

  async findByUser(userId: string): Promise<Objetivo[]> {
    const result = await this.db.query<ObjetivoRow>(
      `SELECT ${COLUMNS}
         FROM objetivos
        WHERE user_id = $1
        ORDER BY created_at DESC`,
      [userId],
    );
    return result.rows.map(mapRow);
  }

  async findByPeriodo(userId: string, periodoId: string): Promise<Objetivo[]> {
    const result = await this.db.query<ObjetivoRow>(
      `SELECT ${COLUMNS}
         FROM objetivos
        WHERE user_id = $1 AND periodo_id = $2
        ORDER BY created_at DESC`,
      [userId, periodoId],
    );
    return result.rows.map(mapRow);
  }

  async findForReport(userId: string, periodoId: string): Promise<Objetivo[]> {
    const result = await this.db.query<ObjetivoRow>(
      `SELECT ${COLUMNS}
         FROM objetivos
        WHERE user_id = $1 AND (periodo_id = $2 OR periodo_id IS NULL)
        ORDER BY created_at DESC`,
      [userId, periodoId],
    );
    return result.rows.map(mapRow);
  }

  async findById(id: string): Promise<Objetivo | null> {
    const result = await this.db.query<ObjetivoRow>(
      `SELECT ${COLUMNS}
         FROM objetivos
        WHERE id = $1
        LIMIT 1`,
      [id],
    );
    return result.rows[0] ? mapRow(result.rows[0]) : null;
  }

  async create(data: {
    userId: string;
    periodoId?: string | null;
    name: string;
    description?: string | null;
    targetAmount: number;
    deadline?: Date | null;
    startDate?: Date | null;
    priority: ObjetivoPriority;
  }): Promise<Objetivo> {
    const result = await this.db.query<ObjetivoRow>(
      `INSERT INTO objetivos (user_id, periodo_id, name, description, target_amount, deadline, start_date, priority)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
       RETURNING ${COLUMNS}`,
      [
        data.userId,
        data.periodoId ?? null,
        data.name,
        data.description ?? null,
        data.targetAmount,
        data.deadline ?? null,
        data.startDate ?? null,
        data.priority,
      ],
    );
    return mapRow(result.rows[0]);
  }

  async update(
    id: string,
    data: {
      name?: string;
      description?: string | null;
      targetAmount?: number;
      deadline?: Date | null;
      startDate?: Date | null;
      periodoId?: string | null;
      priority?: ObjetivoPriority;
    },
  ): Promise<Objetivo | null> {
    const updates: string[] = [];
    const params: any[] = [];
    let paramIndex = 1;

    if (data.name !== undefined) {
      updates.push(`name = $${paramIndex}`);
      params.push(data.name);
      paramIndex++;
    }

    if (data.description !== undefined) {
      updates.push(`description = $${paramIndex}`);
      params.push(data.description);
      paramIndex++;
    }

    if (data.targetAmount !== undefined) {
      updates.push(`target_amount = $${paramIndex}`);
      params.push(data.targetAmount);
      paramIndex++;
    }

    if (data.deadline !== undefined) {
      updates.push(`deadline = $${paramIndex}`);
      params.push(data.deadline);
      paramIndex++;
    }

    if (data.startDate !== undefined) {
      updates.push(`start_date = $${paramIndex}`);
      params.push(data.startDate);
      paramIndex++;
    }

    if (data.periodoId !== undefined) {
      updates.push(`periodo_id = $${paramIndex}`);
      params.push(data.periodoId);
      paramIndex++;
    }

    if (data.priority !== undefined) {
      updates.push(`priority = $${paramIndex}`);
      params.push(data.priority);
      paramIndex++;
    }

    if (updates.length === 0) {
      return this.findById(id);
    }

    updates.push('updated_at = NOW()');
    params.push(id);

    const result = await this.db.query<ObjetivoRow>(
      `UPDATE objetivos
          SET ${updates.join(', ')}
        WHERE id = $${paramIndex}
        RETURNING ${COLUMNS}`,
      params,
    );
    return result.rows[0] ? mapRow(result.rows[0]) : null;
  }

  async deposit(id: string, amount: number): Promise<Objetivo | null> {
    const result = await this.db.query<ObjetivoRow>(
      `UPDATE objetivos
          SET current_amount = current_amount + $1, updated_at = NOW()
        WHERE id = $2
        RETURNING ${COLUMNS}`,
      [amount, id],
    );
    return result.rows[0] ? mapRow(result.rows[0]) : null;
  }

  async withdraw(id: string, amount: number): Promise<Objetivo | null> {
    const result = await this.db.query<ObjetivoRow>(
      `UPDATE objetivos
          SET current_amount = GREATEST(current_amount - $1, 0), updated_at = NOW()
        WHERE id = $2
        RETURNING ${COLUMNS}`,
      [amount, id],
    );
    return result.rows[0] ? mapRow(result.rows[0]) : null;
  }

  async setStatus(id: string, status: ObjetivoStatus): Promise<Objetivo | null> {
    const result = await this.db.query<ObjetivoRow>(
      `UPDATE objetivos
          SET status = $1, updated_at = NOW()
        WHERE id = $2
        RETURNING ${COLUMNS}`,
      [status, id],
    );
    return result.rows[0] ? mapRow(result.rows[0]) : null;
  }

  async delete(id: string): Promise<boolean> {
    const result = await this.db.query(
      `DELETE FROM objetivos WHERE id = $1`,
      [id],
    );
    return result.rowCount !== null && result.rowCount > 0;
  }
}