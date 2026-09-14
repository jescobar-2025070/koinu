import { inject, Injectable } from '@angular/core';
import { firstValueFrom } from 'rxjs';
import { ApiService } from './api.service';
import { User } from '../auth/auth.models';
import { AdminPeriod } from '../models/api.models';

@Injectable({ providedIn: 'root' })
export class AdminService {
  private readonly api = inject(ApiService);

  async listUsers(): Promise<User[]> {
    const res = await firstValueFrom(this.api.get<{ users: User[] }>('/users'));
    return res.users;
  }

  async setActive(id: string, isActive: boolean): Promise<User> {
    const res = await firstValueFrom(this.api.patch<{ user: User }>(`/users/${id}/active`, { isActive }));
    return res.user;
  }

  async setRoles(id: string, roles: string[]): Promise<User> {
    const res = await firstValueFrom(this.api.put<{ user: User }>(`/users/${id}/roles`, { roles }));
    return res.user;
  }

  async deleteUser(id: string): Promise<void> {
    await firstValueFrom(this.api.delete(`/users/${id}`));
  }

  async createUser(email: string, password: string, roles: string[]): Promise<User> {
    const res = await firstValueFrom(this.api.post<{ user: User }>('/users', { email, password, roles }));
    return res.user;
  }

  async updateEmail(id: string, email: string): Promise<User> {
    const res = await firstValueFrom(this.api.patch<{ user: User }>(`/users/${id}`, { email }));
    return res.user;
  }

  async resetPassword(id: string, password: string): Promise<void> {
    await firstValueFrom(this.api.post(`/users/${id}/reset-password`, { password }));
  }

  async listPeriods(): Promise<AdminPeriod[]> {
    const res = await firstValueFrom(this.api.get<{ periodos: AdminPeriod[] }>('/admin/periods'));
    return res.periodos;
  }

  async cancelPeriod(id: string): Promise<AdminPeriod> {
    const res = await firstValueFrom(this.api.post<{ periodo: AdminPeriod }>(`/admin/periods/${id}/cancel`));
    return res.periodo;
  }
}