import { inject, Injectable } from '@angular/core';
import { firstValueFrom } from 'rxjs';
import { ApiService } from './api.service';
import { MovimientoAuditoria } from '../models/api.models';

@Injectable({ providedIn: 'root' })
export class AuditService {
  private readonly api = inject(ApiService);

  async getMovementsAudit(periodoId: string): Promise<MovimientoAuditoria[]> {
    const res = await firstValueFrom(
      this.api.get<{ auditoria: MovimientoAuditoria[] }>(`/periods/${periodoId}/audit`),
    );
    return res.auditoria;
  }
}