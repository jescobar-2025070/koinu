import { inject, Injectable } from '@angular/core';
import { firstValueFrom } from 'rxjs';
import { ApiService } from './api.service';
import { ReportData } from '../models/api.models';

@Injectable({ providedIn: 'root' })
export class ReportService {
  private readonly api = inject(ApiService);

  async getPreliminary(periodoId: string): Promise<ReportData> {
    return await firstValueFrom(
      this.api.get<{ report: ReportData }>(`/periods/${periodoId}/reports/preliminary`),
    ).then((res) => res.report);
  }

  async getFinal(periodoId: string): Promise<{ report: ReportData; generadoEn: string }> {
    return await firstValueFrom(
      this.api.get<{ report: ReportData; generadoEn: string }>(`/periods/${periodoId}/reports/final`),
    );
  }
}