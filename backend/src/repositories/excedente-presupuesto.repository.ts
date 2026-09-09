import { Db } from '../config/db';
import {
  ExcedenteConMovimiento,
  ExcedenteMovimiento,
  ExcedentePresupuesto,
} from '../entities/excedente-presupuesto.entity';

interface ExcedenteRow {
  id: string;
  presupuesto_id: string;
  movimiento_id: string;
  amount: string | number;
  created_at: Date;
}

interface ExcedenteConMovimientoRow extends ExcedenteRow {
  m_id: string;
  m_date: Date;
  m_amount: string | number;
  m_description: string | null;
  m_categoria_id: string | null;
  m_categoria_nombre: string | null;
}

function mapRow(row: ExcedenteRow): ExcedentePresupuesto {
  return {
    id: row.id,
    presupuestoId: row.presupuesto_id,
    movimientoId: row.movimiento_id,
    amount: Number(row.amount),
    createdAt: row.created_at,
  };
}

function mapConMovimientoRow(row: ExcedenteConMovimientoRow): ExcedenteConMovimiento {
  const movimiento: ExcedenteMovimiento = {
    id: row.m_id,
    date: row.m_date,
    amount: Number(row.m_amount),
    description: row.m_description,
    categoriaId: row.m_categoria_id,
    categoriaNombre: row.m_categoria_nombre,
  };
  return {
    ...mapRow(row),
    movimiento,
  };
}

export class ExcedentePresupuestoRepository {
  constructor(private readonly db: Db) {}

  async findTotalByPresupuesto(presupuestoId: string): Promise<number> {
    const result = await this.db.query<{ total: number | null }>(
      `SELECT COALESCE(SUM(amount), 0) AS total
         FROM excedentes_presupuesto
        WHERE presupuesto_id = $1`,
      [presupuestoId],
    );
    return Number(result.rows[0].total);
  }

  async findByPresupuesto(presupuestoId: string): Promise<ExcedenteConMovimiento[]> {
    const result = await this.db.query<ExcedenteConMovimientoRow>(
      `SELECT e.id, e.presupuesto_id, e.movimiento_id, e.amount, e.created_at,
              m.id AS m_id,
              m.date AS m_date,
              m.amount AS m_amount,
              m.description AS m_description,
              m.expense_category_id AS m_categoria_id,
              c.name AS m_categoria_nombre
         FROM excedentes_presupuesto e
         JOIN movimientos m ON m.id = e.movimiento_id
         LEFT JOIN categorias_gasto c ON c.id = m.expense_category_id
        WHERE e.presupuesto_id = $1
        ORDER BY e.created_at DESC`,
      [presupuestoId],
    );
    return result.rows.map(mapConMovimientoRow);
  }

  async create(data: {
    presupuestoId: string;
    movimientoId: string;
    amount: number;
  }): Promise<ExcedentePresupuesto> {
    const result = await this.db.query<ExcedenteRow>(
      `INSERT INTO excedentes_presupuesto (presupuesto_id, movimiento_id, amount)
       VALUES ($1, $2, $3)
       RETURNING id, presupuesto_id, movimiento_id, amount, created_at`,
      [data.presupuestoId, data.movimientoId, data.amount],
    );
    return mapRow(result.rows[0]);
  }

  async deleteByPresupuesto(presupuestoId: string): Promise<void> {
    await this.db.query(
      `DELETE FROM excedentes_presupuesto WHERE presupuesto_id = $1`,
      [presupuestoId],
    );
  }
}