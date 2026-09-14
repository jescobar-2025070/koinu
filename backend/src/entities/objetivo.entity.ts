export type ObjetivoStatus = 'ACTIVE' | 'COMPLETED' | 'CANCELLED';
export type ObjetivoPriority = 'ALTA' | 'MEDIA' | 'BAJA';

export interface Objetivo {
  id: string;
  userId: string;
  periodoId: string | null;
  name: string;
  description: string | null;
  targetAmount: number;
  currentAmount: number;
  deadline: Date | null;
  startDate: Date | null;
  priority: ObjetivoPriority;
  status: ObjetivoStatus;
  createdAt: Date;
  updatedAt: Date;
}