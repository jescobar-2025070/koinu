import { Injectable, computed, inject, signal } from '@angular/core';
import { Router } from '@angular/router';
import { firstValueFrom } from 'rxjs';
import { ApiService } from '../services/api.service';
import { AuthResponse, ForgotPasswordResponse, User, isTerminalSessionError } from './auth.models';
import { Auth0ClientService } from './auth0-client.service';
import { environment } from '../config/environment';

export type AuthStatus = 'checking' | 'authenticated' | 'guest';

const REFRESH_TOKEN_KEY = 'koinu_refresh_token';

const ACTIVITY_EVENTS = ['pointerdown', 'mousemove', 'keydown', 'touchstart'] as const;

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

  private readonly IDLE_CHECK_INTERVAL_MS = 30000;
  private readonly HEARTBEAT_PAUSE_AFTER_MS = 60000;
  private sessionIdleTimeoutMs = environment.sessionIdleTimeoutMs;
  private lastUserActivity = Date.now();
  private idleCheck: ReturnType<typeof setInterval> | null = null;

  private readonly markActivity = (): void => {
    this.lastUserActivity = Date.now();
    this.resumeHeartbeat();
  };

  markSessionExpired(): void {
    if (this.redirectingToLogin) {
      return;
    }
    this.sessionExpired.set(true);
  }

  /**
   * Una respuesta 401 con un estado de sesión terminal (expirada por tiempo,
   * por inactividad o invalidada) finaliza la sesión y muestra el aviso de
   * "SESIÓN EXPIRADA". No navega: el aviso ofrece volver al login.
   */
  handleSessionEnded(): void {
    this.clearSession();
    this.markSessionExpired();
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
      const client = await this.auth0Client.getClient();

      // 1. Interceptar el callback de Auth0 (si venimos de una redirección)
      if (window.location.search.includes('code=') && window.location.search.includes('state=')) {
        await client.handleRedirectCallback();
        
        // Limpiar la URL para no dejar parámetros sensibles a la vista
        window.history.replaceState({}, document.title, window.location.pathname);

        // Extraer el token de Auth0 y enviarlo al backend
        const claims = await client.getIdTokenClaims();
        const idToken = claims?.__raw;
        
        if (idToken) {
          const response = await firstValueFrom(this.api.post<AuthResponse>('/auth/google', { idToken }));
          this.applySessionConfig(response);
          this.persistRefreshToken(response.refreshToken);
          this.user.set(response.user);
          this.status.set('authenticated');
          this.redirectingToLogin = false;
          this.startHeartbeat();
          return; // La sesión de Google se inició con éxito, terminamos el init.
        }
      }
      // 2. Flujo normal (validación de sesión existente en el backend)
      const response = await firstValueFrom(this.api.get<AuthResponse>('/auth/me'));
      this.applySessionConfig(response);
      this.user.set(response.user);
      this.status.set('authenticated');
      this.redirectingToLogin = false;
      this.startHeartbeat();
      
    } catch (error: any) {
      if (await this.refreshSession()) {
        return;
      }
      if (isTerminalSessionError(error)) {
        this.handleSessionEnded();
      } else {
        this.clearSession();
      }
    }
  }

  async login(email: string, password: string): Promise<void> {
    const response = await firstValueFrom(
      this.api.post<AuthResponse>('/auth/login', { email, password }),
    );
    this.applySessionConfig(response);
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
    await client.loginWithRedirect({ 
      authorizationParams: { 
        connection: 'google-oauth2',
        redirect_uri: window.location.origin // Fuerza a que regrese a la raíz de tu app
      } 
    });
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
    if (!this.refreshInFlight) {
      this.refreshInFlight = this.performRefresh();
    }
    return this.refreshInFlight;
  }

  private refreshInFlight: Promise<boolean> | null = null;

  private async performRefresh(): Promise<boolean> {
    const refreshToken = this.getRefreshToken();
    if (!refreshToken) {
      return false;
    }
    try {
      const response = await firstValueFrom(
        this.api.post<AuthResponse>('/auth/refresh', { refreshToken }),
      );
      this.applySessionConfig(response);
      this.persistRefreshToken(response.refreshToken);
      this.user.set(response.user);
      this.status.set('authenticated');
      this.redirectingToLogin = false;
      this.startHeartbeat();
      return true;
    } catch (error) {
      if (isTerminalSessionError(error)) {
        this.handleSessionEnded();
      }
      return false;
    } finally {
      this.refreshInFlight = null;
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
    this.startIdleTracking();
  }

  private pauseHeartbeat(): void {
    if (this.heartbeat) {
      clearInterval(this.heartbeat);
      this.heartbeat = null;
    }
  }

  private resumeHeartbeat(): void {
    if (this.status() !== 'authenticated' || this.heartbeat) {
      return;
    }
    this.startHeartbeat();
  }

  private stopHeartbeat(): void {
    if (this.heartbeat) {
      clearInterval(this.heartbeat);
      this.heartbeat = null;
      this.stopIdleTracking();
    }
  }

  private startIdleTracking(): void {
    if (this.idleCheck) {
      return;
    }
    this.lastUserActivity = Date.now();
    ACTIVITY_EVENTS.forEach((event) =>
      window.addEventListener(event, this.markActivity, { passive: true }),
    );
    this.idleCheck = setInterval(() => this.checkIdle(), this.IDLE_CHECK_INTERVAL_MS);
  }

  private stopIdleTracking(): void {
    if (this.idleCheck) {
      clearInterval(this.idleCheck);
      this.idleCheck = null;
    }
    ACTIVITY_EVENTS.forEach((event) => window.removeEventListener(event, this.markActivity));
  }

  private checkIdle(): void {
    if (this.status() !== 'authenticated') {
      return;
    }
    const idleMs = Date.now() - this.lastUserActivity;
    if (idleMs >= this.sessionIdleTimeoutMs) {
      this.handleSessionEnded();
      return;
    }
    if (idleMs >= this.HEARTBEAT_PAUSE_AFTER_MS) {
      this.pauseHeartbeat();
    } else {
      this.resumeHeartbeat();
    }
  }

  private applySessionConfig(response: AuthResponse): void {
    if (response.sessionIdleTimeoutMs) {
      this.sessionIdleTimeoutMs = response.sessionIdleTimeoutMs;
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