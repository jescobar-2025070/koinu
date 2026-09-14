export type MovimientoAuditoriaTipo = 'CREADO' | 'MODIFICADO' | 'ELIMINADO';

export interface MovimientoAuditoria {
  id: string;
  movimientoId: string;
  periodoId: string;
  userId: string;
  tipo: MovimientoAuditoriaTipo;
  resumen: Record<string, unknown>;
  createdAt: Date;
}