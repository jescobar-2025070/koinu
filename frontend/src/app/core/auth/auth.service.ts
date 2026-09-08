import { Injectable, computed, inject, signal } from '@angular/core';
import { Router } from '@angular/router';
import { firstValueFrom } from 'rxjs';
import { ApiService } from '../services/api.service';
import { AuthResponse, ForgotPasswordResponse, User } from './auth.models';
import { Auth0ClientService } from './auth0-client.service';

export type AuthStatus = 'checking' | 'authenticated' | 'guest';

const REFRESH_TOKEN_KEY = 'koinu_refresh_token';

@Injectable({ providedIn: 'root' })
export class AuthService {
  private readonly api = inject(ApiService);
  private readonly router = inject(Router);
  private readonly auth0Client = inject(Auth0ClientService);

  readonly user = signal<User | null>(null);
  readonly status = signal<AuthStatus>('checking');
  readonly isAuthenticated = computed(() => this.status() === 'authenticated');

  private initPromise: Promise<void> | null = null;
  readonly sessionExpired = signal(false);

  private readonly HEARTBEAT_INTERVAL_MS = 15000;
  private heartbeat: ReturnType<typeof setInterval> | null = null;
  private redirectingToLogin = false;

  markSessionExpired(): void {
    if (this.redirectingToLogin) {
      return;
    }
    this.sessionExpired.set(true);
  }

  clearSessionExpired(): void {
    this.sessionExpired.set(false);
  }

  confirmExpiredRedirect(): void {
    this.redirectingToLogin = true;
    this.sessionExpired.set(false);
    this.clearSession();
  }

  ensureInitialized(): Promise<void> {
    if (!this.initPromise) {
      this.initPromise = this.init();
    }
    return this.initPromise;
  }

  private async init(): Promise<void> {
    try {
      const response = await firstValueFrom(this.api.get<AuthResponse>('/auth/me'));
      this.user.set(response.user);
      this.status.set('authenticated');
      this.redirectingToLogin = false;
      this.startHeartbeat();
    } catch (error: any) {
      if (await this.refreshSession()) {
        return;
      }
      if (error?.error?.error?.code === 'TOKEN_EXPIRED') {
        this.markSessionExpired();
      }
      this.clearSession();
    }
  }

  async login(email: string, password: string): Promise<void> {
    const response = await firstValueFrom(
      this.api.post<AuthResponse>('/auth/login', { email, password }),
    );
    this.persistRefreshToken(response.refreshToken);
    this.user.set(response.user);
    this.status.set('authenticated');
    this.redirectingToLogin = false;
    this.startHeartbeat();
  }

  async register(email: string, password: string): Promise<void> {
    await firstValueFrom(this.api.post<AuthResponse>('/auth/register', { email, password }));
  }

  /**
   * Inicia sesión (o registra, si la cuenta no existe) con Google mediante Auth0.
   * Un mismo flujo sirve tanto para "Continuar con Google" como para
   * "Registrarse con Google": el backend decide si crea o reutiliza la cuenta.
   * Al terminar deja la misma sesión (cookie + refresh token) que el login tradicional.
   */
  async loginWithGoogle(): Promise<void> {
    const client = await this.auth0Client.getClient();

    try {
      await client.loginWithPopup({ authorizationParams: { connection: 'google-oauth2' } });
    } catch (err: any) {
      if (err?.error === 'cancelled' || err?.error === 'popup_closed') {
        // El usuario cerró la ventana de Google: no es un error que deba mostrarse.
        return;
      }
      throw new Error('No se pudo completar el inicio de sesión con Google.');
    }

    const claims = await client.getIdTokenClaims();
    const idToken = claims?.__raw;
    if (!idToken) {
      throw new Error('No se pudo obtener el token de Google.');
    }

    const response = await firstValueFrom(this.api.post<AuthResponse>('/auth/google', { idToken }));
    this.persistRefreshToken(response.refreshToken);
    this.user.set(response.user);
    this.status.set('authenticated');
    this.redirectingToLogin = false;
    this.startHeartbeat();
  }

  async logout(): Promise<void> {
    try {
      await firstValueFrom(this.api.post<void>('/auth/logout'));
    } finally {
      this.clearSession();
      await this.router.navigate(['/login']);
    }
  }

  async requestPasswordReset(email: string): Promise<ForgotPasswordResponse> {
    return await firstValueFrom(this.api.post<ForgotPasswordResponse>('/auth/forgot-password', { email }));
  }

  async resetPassword(token: string, password: string): Promise<void> {
    await firstValueFrom(this.api.post<void>('/auth/reset-password', { token, password }));
  }

  async refreshSession(): Promise<boolean> {
    const refreshToken = this.getRefreshToken();
    if (!refreshToken) {
      return false;
    }
    try {
      const response = await firstValueFrom(
        this.api.post<AuthResponse>('/auth/refresh', { refreshToken }),
      );
      this.persistRefreshToken(response.refreshToken);
      this.user.set(response.user);
      this.status.set('authenticated');
      this.redirectingToLogin = false;
      this.startHeartbeat();
      return true;
    } catch {
      this.clearSession();
      return false;
    }
  }

  getRefreshToken(): string | null {
    return localStorage.getItem(REFRESH_TOKEN_KEY);
  }

  private persistRefreshToken(token: string | undefined): void {
    if (token) {
      localStorage.setItem(REFRESH_TOKEN_KEY, token);
    }
  }

  clearSession(): void {
    this.stopHeartbeat();
    this.user.set(null);
    this.status.set('guest');
    this.initPromise = null;
    localStorage.removeItem(REFRESH_TOKEN_KEY);
  }

  hasRole(role: string): boolean {
    return this.user()?.roles.includes(role) ?? false;
  }

  private startHeartbeat(): void {
    if (this.heartbeat) {
      return;
    }
    this.heartbeat = setInterval(() => void this.pingSession(), this.HEARTBEAT_INTERVAL_MS);
  }

  private stopHeartbeat(): void {
    if (this.heartbeat) {
      clearInterval(this.heartbeat);
      this.heartbeat = null;
    }
  }

  private async pingSession(): Promise<void> {
    try {
      await firstValueFrom(this.api.get<AuthResponse>('/auth/me'));
    } catch {
      // Si el token expiró, el interceptor se encarga de intentar refrescarlo.
    }
  }
}