import { Db } from '../config/db';
import { MovimientoAuditoria, MovimientoAuditoriaTipo } from '../entities/movimiento-auditoria.entity';

interface MovimientoAuditoriaRow {
  id: string;
  movimiento_id: string;
  periodo_id: string;
  user_id: string;
  tipo: MovimientoAuditoriaTipo;
  resumen: Record<string, unknown>;
  created_at: Date;
}

function mapRow(row: MovimientoAuditoriaRow): MovimientoAuditoria {
  return {
    id: row.id,
    movimientoId: row.movimiento_id,
    periodoId: row.periodo_id,
    userId: row.user_id,
    tipo: row.tipo,
    resumen: row.resumen,
    createdAt: row.created_at,
  };
}

export class MovimientoAuditoriaRepository {
  constructor(private readonly db: Db) {}

  async create(data: {
    movimientoId: string;
    periodoId: string;
    userId: string;
    tipo: MovimientoAuditoriaTipo;
    resumen: Record<string, unknown>;
  }): Promise<MovimientoAuditoria> {
    const result = await this.db.query<MovimientoAuditoriaRow>(
      `INSERT INTO movimiento_auditoria (movimiento_id, periodo_id, user_id, tipo, resumen)
       VALUES ($1, $2, $3, $4, $5)
       RETURNING id, movimiento_id, periodo_id, user_id, tipo, resumen, created_at`,
      [
        data.movimientoId,
        data.periodoId,
        data.userId,
        data.tipo,
        JSON.stringify(data.resumen),
      ],
    );
    return mapRow(result.rows[0]);
  }

  async findByPeriodo(userId: string, periodoId: string): Promise<MovimientoAuditoria[]> {
    const result = await this.db.query<MovimientoAuditoriaRow>(
      `SELECT id, movimiento_id, periodo_id, user_id, tipo, resumen, created_at
         FROM movimiento_auditoria
        WHERE user_id = $1 AND periodo_id = $2
        ORDER BY created_at DESC
        LIMIT 500`,
      [userId, periodoId],
    );
    return result.rows.map(mapRow);
  }

  async findByMovimiento(userId: string, movimientoId: string): Promise<MovimientoAuditoria[]> {
    const result = await this.db.query<MovimientoAuditoriaRow>(
      `SELECT id, movimiento_id, periodo_id, user_id, tipo, resumen, created_at
         FROM movimiento_auditoria
        WHERE user_id = $1 AND movimiento_id = $2
        ORDER BY created_at ASC`,
      [userId, movimientoId],
    );
    return result.rows.map(mapRow);
  }
}