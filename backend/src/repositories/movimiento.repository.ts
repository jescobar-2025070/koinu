import { Db } from '../config/db';
import { Movimiento, MovimientoType } from '../entities/movimiento.entity';

interface MovimientoRow {
  id: string;
  user_id: string;
  periodo_id: string;
  type: MovimientoType;
  income_category_id: string | null;
  expense_category_id: string | null;
  amount: number;
  description: string | null;
  date: Date;
  created_at: Date;
  updated_at: Date;
  deleted_at: Date | null;
}

function mapRow(row: MovimientoRow): Movimiento {
  return {
    id: row.id,
    userId: row.user_id,
    periodoId: row.periodo_id,
    type: row.type,
    incomeCategoryId: row.income_category_id,
    expenseCategoryId: row.expense_category_id,
    amount: row.amount,
    description: row.description,
    date: row.date,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    deletedAt: row.deleted_at,
  };
}

interface MovimientoCreateData {
  userId: string;
  periodoId: string;
  type: MovimientoType;
  incomeCategoryId?: string | null;
  expenseCategoryId?: string | null;
  amount: number;
  description?: string;
  date?: Date;
}

export class MovimientoRepository {
  constructor(private readonly db: Db) {}

  async findByUser(userId: string, periodId?: string): Promise<Movimiento[]> {
    let query = `
      SELECT id, user_id, periodo_id, type, income_category_id, expense_category_id, amount, description, date, created_at, updated_at, deleted_at
        FROM movimientos
       WHERE user_id = $1 AND deleted_at IS NULL`;
    const params: any[] = [userId];

    if (periodId) {
      query += ` AND periodo_id = $2`;
      params.push(periodId);
    }

    query += ` ORDER BY date DESC, created_at DESC LIMIT 200`;
    const result = await this.db.query<MovimientoRow>(query, params);
    return result.rows.map(mapRow);
  }

  async findByPeriodo(periodId: string): Promise<Movimiento[]> {
    const result = await this.db.query<MovimientoRow>(
      `SELECT id, user_id, periodo_id, type, income_category_id, expense_category_id, amount, description, date, created_at, updated_at, deleted_at
         FROM movimientos
        WHERE periodo_id = $1 AND deleted_at IS NULL
        ORDER BY date DESC, created_at DESC`,
      [periodId],
    );
    return result.rows.map(mapRow);
  }

  async findById(id: string): Promise<Movimiento | null> {
    const result = await this.db.query<MovimientoRow>(
      `SELECT id, user_id, periodo_id, type, income_category_id, expense_category_id, amount, description, date, created_at, updated_at, deleted_at
         FROM movimientos
        WHERE id = $1 AND deleted_at IS NULL
        LIMIT 1`,
      [id],
    );
    return result.rows[0] ? mapRow(result.rows[0]) : null;
  }

  async getStats(userId: string, periodId?: string): Promise<{ totalIngresos: number; totalGastos: number }> {
    let query = `
      SELECT
        COALESCE(SUM(CASE WHEN type = 'INCOME' THEN amount ELSE 0 END), 0) as total_ingresos,
        COALESCE(SUM(CASE WHEN type = 'EXPENSE' THEN amount ELSE 0 END), 0) as total_gastos
      FROM movimientos
      WHERE user_id = $1 AND deleted_at IS NULL`;
    const params: any[] = [userId];

    if (periodId) {
      query += ` AND periodo_id = $2`;
      params.push(periodId);
    }

    const result = await this.db.query<{ total_ingresos: number; total_gastos: number }>(query, params);
    return {
      totalIngresos: result.rows[0].total_ingresos,
      totalGastos: result.rows[0].total_gastos,
    };
  }

  async getStatsByPeriodo(periodoId: string): Promise<{ totalIngresos: number; totalGastos: number }> {
    const result = await this.db.query<{ total_ingresos: number; total_gastos: number }>(
      `SELECT
        COALESCE(SUM(CASE WHEN type = 'INCOME' THEN amount ELSE 0 END), 0) as total_ingresos,
        COALESCE(SUM(CASE WHEN type = 'EXPENSE' THEN amount ELSE 0 END), 0) as total_gastos
      FROM movimientos
      WHERE periodo_id = $1 AND deleted_at IS NULL`,
      [periodoId],
    );
    return {
      totalIngresos: result.rows[0].total_ingresos,
      totalGastos: result.rows[0].total_gastos,
    };
  }

  async findExpensesByPeriodo(periodoId: string): Promise<
    { id: string; amount: number; createdAt: Date }[]
  > {
    const result = await this.db.query<{ id: string; amount: number; created_at: Date }>(
      `SELECT id, amount, created_at
         FROM movimientos
        WHERE periodo_id = $1 AND type = 'EXPENSE' AND deleted_at IS NULL
        ORDER BY created_at ASC`,
      [periodoId],
    );
    return result.rows.map((row) => ({
      id: row.id,
      amount: Number(row.amount),
      createdAt: row.created_at,
    }));
  }

  async getCategoryBreakdown(periodoId: string): Promise<
    { categoryId: string | null; nombre: string; type: MovimientoType; total: number }[]
  > {
    const result = await this.db.query<{
      category_id: string | null;
      category_name: string;
      type: MovimientoType;
      total: number;
    }>(
      `SELECT
        COALESCE(ci.id, cg.id) AS category_id,
        COALESCE(ci.name, cg.name) AS category_name,
        m.type,
        SUM(m.amount) AS total
       FROM movimientos m
       LEFT JOIN categorias_ingreso ci ON ci.id = m.income_category_id
       LEFT JOIN categorias_gasto cg ON cg.id = m.expense_category_id
       WHERE m.periodo_id = $1 AND m.deleted_at IS NULL
       GROUP BY category_id, category_name, m.type
       ORDER BY total DESC`,
      [periodoId],
    );
    return result.rows.map((row) => ({
      categoryId: row.category_id,
      nombre: row.category_name ?? '—',
      type: row.type,
      total: row.total,
    }));
  }

  async create(data: MovimientoCreateData): Promise<Movimiento> {
    const result = await this.db.query<MovimientoRow>(
      `INSERT INTO movimientos (user_id, periodo_id, type, income_category_id, expense_category_id, amount, description, date)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
       RETURNING id, user_id, periodo_id, type, income_category_id, expense_category_id, amount, description, date, created_at, updated_at, deleted_at`,
      [
        data.userId,
        data.periodoId,
        data.type,
        data.incomeCategoryId ?? null,
        data.expenseCategoryId ?? null,
        data.amount,
        data.description ?? null,
        data.date ?? new Date(),
      ],
    );
    return mapRow(result.rows[0]);
  }

  async delete(id: string): Promise<boolean> {
    const result = await this.db.query(
      `UPDATE movimientos SET deleted_at = NOW() WHERE id = $1`,
      [id],
    );
    return result.rowCount !== null && result.rowCount > 0;
  }

  async update(
    id: string,
    data: { amount?: number; description?: string; date?: Date },
  ): Promise<Movimiento | null> {
    const updates: string[] = [];
    const params: any[] = [id];
    if (data.amount !== undefined) {
      params.push(data.amount);
      updates.push(`amount = $${params.length}`);
    }
    if (data.description !== undefined) {
      params.push(data.description);
      updates.push(`description = $${params.length}`);
    }
    if (data.date !== undefined) {
      params.push(data.date);
      updates.push(`date = $${params.length}`);
    }
    if (updates.length === 0) {
      return this.findById(id);
    }
    params.push(new Date());
    updates.push(`updated_at = $${params.length}`);
    const result = await this.db.query<MovimientoRow>(
      `UPDATE movimientos SET ${updates.join(', ')}
       WHERE id = $1 AND deleted_at IS NULL
       RETURNING id, user_id, periodo_id, type, income_category_id, expense_category_id, amount, description, date, created_at, updated_at, deleted_at`,
      params,
    );
    return result.rows[0] ? mapRow(result.rows[0]) : null;
  }
}
