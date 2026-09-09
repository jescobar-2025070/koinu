import { inject, Injectable } from '@angular/core';
import { firstValueFrom } from 'rxjs';
import { ApiService } from './api.service';
import { Objetivo, ObjetivoPriority } from '../models/api.models';

export interface CrearObjetivo {
  periodoId?: string;
  name: string;
  description?: string;
  targetAmount: number;
  deadline?: string;
  startDate?: string;
  priority?: ObjetivoPriority;
}

export interface ActualizarObjetivo {
  name?: string;
  description?: string;
  targetAmount?: number;
  deadline?: string | null;
  startDate?: string | null;
  periodoId?: string | null;
  priority?: ObjetivoPriority;
}

@Injectable({ providedIn: 'root' })
export class ObjetivoService {
  private readonly api = inject(ApiService);

  async list(): Promise<Objetivo[]> {
    const res = await firstValueFrom(this.api.get<{ objetivos: Objetivo[] }>('/objectives'));
    return res.objetivos;
  }

  async listByPeriod(periodoId: string): Promise<Objetivo[]> {
    const res = await firstValueFrom(
      this.api.get<{ objetivos: Objetivo[] }>(`/objectives/period/${periodoId}`),
    );
    return res.objetivos;
  }

  async create(data: CrearObjetivo): Promise<Objetivo> {
    const res = await firstValueFrom(this.api.post<{ objetivo: Objetivo }>('/objectives', data));
    return res.objetivo;
  }

  async createByPeriod(periodoId: string, data: Omit<CrearObjetivo, 'periodoId'>): Promise<Objetivo> {
    const res = await firstValueFrom(
      this.api.post<{ objetivo: Objetivo }>(`/objectives/period/${periodoId}`, data),
    );
    return res.objetivo;
  }

  async update(id: string, data: ActualizarObjetivo): Promise<Objetivo> {
    const res = await firstValueFrom(this.api.patch<{ objetivo: Objetivo }>(`/objectives/${id}`, data));
    return res.objetivo;
  }

  async delete(id: string): Promise<void> {
    await firstValueFrom(this.api.delete(`/objectives/${id}`));
  }

  async deposit(id: string, amount: number): Promise<Objetivo> {
    const res = await firstValueFrom(this.api.post<{ objetivo: Objetivo }>(`/objectives/${id}/contributions`, { amount }));
    return res.objetivo;
  }

  async withdraw(id: string, amount: number): Promise<Objetivo> {
    const res = await firstValueFrom(this.api.post<{ objetivo: Objetivo }>(`/objectives/${id}/withdrawals`, { amount }));
    return res.objetivo;
  }

  async complete(id: string): Promise<Objetivo> {
    const res = await firstValueFrom(this.api.post<{ objetivo: Objetivo }>(`/objectives/${id}/complete`));
    return res.objetivo;
  }

  async cancel(id: string): Promise<Objetivo> {
    const res = await firstValueFrom(this.api.post<{ objetivo: Objetivo }>(`/objectives/${id}/cancel`));
    return res.objetivo;
  }
}