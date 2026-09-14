import { inject, Injectable } from '@angular/core';
import { firstValueFrom } from 'rxjs';
import { ApiService } from './api.service';
import { TratamientoFiscal } from '../models/api.models';

@Injectable({ providedIn: 'root' })
export class TratamientoFiscalService {
  private readonly api = inject(ApiService);

  async list(): Promise<TratamientoFiscal[]> {
    const res = await firstValueFrom(
      this.api.get<{ tratamientos: TratamientoFiscal[] }>('/tax-treatments'),
    );
    return res.tratamientos;
  }
}