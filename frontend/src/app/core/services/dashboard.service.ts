import { inject, Injectable } from '@angular/core';
import { firstValueFrom } from 'rxjs';
import { ApiService } from './api.service';
import { DashboardData } from '../models/api.models';

@Injectable({ providedIn: 'root' })
export class DashboardService {
  private readonly api = inject(ApiService);

  async get(periodId: string): Promise<DashboardData> {
    return await firstValueFrom(
      this.api.get<{ dashboard: DashboardData }>(`/periods/${periodId}/dashboard`),
    ).then((res) => res.dashboard);
  }
}
