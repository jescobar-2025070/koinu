import { Db } from '../config/db';
import { DetalleIngreso } from '../entities/detalle-ingreso.entity';

interface DetalleRow {
  movement_id: string;
  tax_treatment_id: string | null;
  gross_amount: number;
  retention_amount: number;
  net_amount: number;
}

function mapRow(row: DetalleRow): DetalleIngreso {
  return {
    movementId: row.movement_id,
    taxTreatmentId: row.tax_treatment_id,
    grossAmount: row.gross_amount,
    retentionAmount: row.retention_amount,
    netAmount: row.net_amount,
  };
}

export class DetalleIngresoRepository {
  constructor(private readonly db: Db) {}

  async findById(movementId: string): Promise<DetalleIngreso | null> {
    const result = await this.db.query<DetalleRow>(
      `SELECT movement_id, tax_treatment_id, gross_amount, retention_amount, net_amount
         FROM detalles_ingreso
        WHERE movement_id = $1
        LIMIT 1`,
      [movementId],
    );
    return result.rows[0] ? mapRow(result.rows[0]) : null;
  }

  async create(data: {
    movementId: string;
    taxTreatmentId: string | null;
    grossAmount: number;
    retentionAmount: number;
    netAmount: number;
  }): Promise<DetalleIngreso> {
    if (data.netAmount !== data.grossAmount - data.retentionAmount) {
      throw new Error('El monto neto debe ser igual a bruto - retención.');
    }
    const result = await this.db.query<DetalleRow>(
      `INSERT INTO detalles_ingreso (movement_id, tax_treatment_id, gross_amount, retention_amount, net_amount)
       VALUES ($1, $2, $3, $4, $5)
       RETURNING movement_id, tax_treatment_id, gross_amount, retention_amount, net_amount`,
      [data.movementId, data.taxTreatmentId, data.grossAmount, data.retentionAmount, data.netAmount],
    );
    return mapRow(result.rows[0]);
  }

  async update(
    movementId: string,
    data: {
      taxTreatmentId?: string | null;
      grossAmount: number;
      retentionAmount: number;
      netAmount: number;
    },
  ): Promise<DetalleIngreso | null> {
    if (data.netAmount !== data.grossAmount - data.retentionAmount) {
      throw new Error('El monto neto debe ser igual a bruto - retención.');
    }
    const result = await this.db.query<DetalleRow>(
      `UPDATE detalles_ingreso
          SET tax_treatment_id = $2, gross_amount = $3, retention_amount = $4, net_amount = $5
        WHERE movement_id = $1
        RETURNING movement_id, tax_treatment_id, gross_amount, retention_amount, net_amount`,
      [movementId, data.taxTreatmentId ?? null, data.grossAmount, data.retentionAmount, data.netAmount],
    );
    return result.rows[0] ? mapRow(result.rows[0]) : null;
  }
}
