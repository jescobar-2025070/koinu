import { Db } from '../config/db';
import { ExcedentePresupuesto } from '../entities/excedente-presupuesto.entity';

interface ExcedenteRow {
  id: string;
  presupuesto_id: string;
  movimiento_id: string;
  amount: number;
  created_at: Date;
}

function mapRow(row: ExcedenteRow): ExcedentePresupuesto {
  return {
    id: row.id,
    presupuestoId: row.presupuesto_id,
    movimientoId: row.movimiento_id,
    amount: row.amount,
    createdAt: row.created_at,
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

  async findByPresupuesto(presupuestoId: string): Promise<ExcedentePresupuesto[]> {
    const result = await this.db.query<ExcedenteRow>(
      `SELECT id, presupuesto_id, movimiento_id, amount, created_at
         FROM excedentes_presupuesto
        WHERE presupuesto_id = $1
        ORDER BY created_at DESC`,
      [presupuestoId],
    );
    return result.rows.map(mapRow);
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