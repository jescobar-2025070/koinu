import { Component } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { provideRouter, Router } from '@angular/router';
import { of, Subject, throwError } from 'rxjs';
import { AuthService } from './auth.service';
import { ApiService } from '../services/api.service';
import { User } from './auth.models';
import { Auth0ClientService } from './auth0-client.service';

@Component({ template: '' })
class LoginStub {}

const user: User = {
  id: 'u-1',
  email: 'a@b.c',
  isActive: true,
  roles: ['ADMIN', 'USR'],
  createdAt: '2026-01-01T00:00:00.000Z',
};

type MockFn = ReturnType<typeof vi.fn>;

interface MockApi {
  get: MockFn;
  post: MockFn;
}

interface MockAuth0Client {
  getClient: MockFn;
}

describe('AuthService', () => {
  let service: AuthService;
  let api: MockApi;
  let auth0Client: MockAuth0Client;

  beforeEach(() => {
    localStorage.clear();
    api = { get: vi.fn(), post: vi.fn() };
    auth0Client = { getClient: vi.fn() };
    TestBed.configureTestingModule({
      providers: [
        provideRouter([{ path: 'login', component: LoginStub }]),
        { provide: ApiService, useValue: api },
        { provide: Auth0ClientService, useValue: auth0Client },
      ],
    });
    service = TestBed.inject(AuthService);
  });

  afterEach(() => {
    service.clearSession();
  });

  it('login autentica, persiste el refresh token y guarda el usuario', async () => {
    api.post.mockReturnValue(of({ user, refreshToken: 'rt-1' }));

    await service.login('a@b.c', 'secreto');

    expect(api.post).toHaveBeenCalledWith('/auth/login', {
      email: 'a@b.c',
      password: 'secreto',
    });
    expect(service.getRefreshToken()).toBe('rt-1');
    expect(service.isAuthenticated()).toBe(true);
    expect(service.user()).toEqual(user);
  });

  it('login no rompe cuando la respuesta no trae refresh token', async () => {
    api.post.mockReturnValue(of({ user }));

    await service.login('a@b.c', 'secreto');

    expect(service.isAuthenticated()).toBe(true);
    expect(service.getRefreshToken()).toBeNull();
  });

  it('hasRole devuelve true solo si el usuario tiene el rol', async () => {
    api.post.mockReturnValue(of({ user }));
    await service.login('a@b.c', 'secreto');

    expect(service.hasRole('ADMIN')).toBe(true);
    expect(service.hasRole('USR')).toBe(true);
    expect(service.hasRole('SUPER')).toBe(false);
  });

  it('refreshSession devuelve false sin refresh token almacenado', async () => {
    expect(await service.refreshSession()).toBe(false);
  });

  it('refreshSession rota el token y restablece la sesión', async () => {
    localStorage.setItem('koinu_refresh_token', 'rt-1');
    api.post.mockReturnValue(of({ user, refreshToken: 'rt-2' }));

    expect(await service.refreshSession()).toBe(true);

    expect(api.post).toHaveBeenCalledWith('/auth/refresh', { refreshToken: 'rt-1' });
    expect(service.getRefreshToken()).toBe('rt-2');
    expect(service.isAuthenticated()).toBe(true);
    expect(service.user()).toEqual(user);
  });

  it('refreshSession deduplica los refrescos simultáneos en uno solo', async () => {
    localStorage.setItem('koinu_refresh_token', 'rt-1');
    const subject = new Subject<{ user: User; refreshToken: string }>();
    api.post.mockReturnValue(subject);

    const first = service.refreshSession();
    const second = service.refreshSession();

    expect(api.post).toHaveBeenCalledTimes(1);
    expect(api.post).toHaveBeenCalledWith('/auth/refresh', { refreshToken: 'rt-1' });

    subject.next({ user, refreshToken: 'rt-2' });
    subject.complete();

    expect(await first).toBe(true);
    expect(await second).toBe(true);
    expect(service.getRefreshToken()).toBe('rt-2');
    expect(service.isAuthenticated()).toBe(true);
  });

  it('refreshSession limpia el token tras un fallo terminal y no reintenta sin él', async () => {
    localStorage.setItem('koinu_refresh_token', 'rt-1');
    api.post.mockReturnValue(
      throwError(() => ({
        error: { error: { code: 'REFRESH_TOKEN_EXPIRED', message: '...', details: {} } },
      })),
    );

    expect(await service.refreshSession()).toBe(false);
    expect(service.getRefreshToken()).toBeNull();

    expect(await service.refreshSession()).toBe(false);
    expect(api.post).toHaveBeenCalledTimes(1);
  });

  it('refreshSession finaliza la sesión cuando el error de sesión es terminal', async () => {
    localStorage.setItem('koinu_refresh_token', 'rt-1');
    api.post.mockReturnValue(
      throwError(() => ({
        error: { error: { code: 'SESSION_IDLE_EXPIRED', message: '...', details: {} } },
      })),
    );
    service.user.set(user);

    expect(await service.refreshSession()).toBe(false);

    expect(service.isAuthenticated()).toBe(false);
    expect(service.user()).toBeNull();
    expect(service.getRefreshToken()).toBeNull();
    expect(service.sessionExpired()).toBe(true);
  });

  it('refreshSession no elimina la sesión ante un error transitorio del servidor', async () => {
    localStorage.setItem('koinu_refresh_token', 'rt-1');
    api.post.mockReturnValue(throwError(() => new Error('network')));
    service.user.set(user);
    service.status.set('authenticated');

    expect(await service.refreshSession()).toBe(false);

    expect(service.isAuthenticated()).toBe(true);
    expect(service.user()).toEqual(user);
    expect(service.getRefreshToken()).toBe('rt-1');
  });

  it('ensureInitialized restaura la sesión vía /auth/me', async () => {
    api.get.mockReturnValue(of({ user }));

    await service.ensureInitialized();

    expect(api.get).toHaveBeenCalledWith('/auth/me');
    expect(service.isAuthenticated()).toBe(true);
    expect(service.user()).toEqual(user);
  });

  it('ensureInitialized deja la sesión como guest cuando el backend falla sin token', async () => {
    api.get.mockReturnValue(throwError(() => new Error('red')));

    await service.ensureInitialized();

    expect(service.isAuthenticated()).toBe(false);
    expect(service.status()).toBe('guest');
  });

  it('clearSession elimina el refresh token y resetea el estado', () => {
    localStorage.setItem('koinu_refresh_token', 'rt-1');
    service.user.set(user);
    service.status.set('authenticated');

    service.clearSession();

    expect(service.getRefreshToken()).toBeNull();
    expect(service.user()).toBeNull();
    expect(service.status()).toBe('guest');
  });

  it('logout limpia la sesión y navega a login', async () => {
    api.post.mockReturnValue(of(undefined));
    const router = TestBed.inject(Router);
    service.user.set(user);
    service.status.set('authenticated');

    await service.logout();

    expect(api.post).toHaveBeenCalledWith('/auth/logout');
    expect(service.status()).toBe('guest');
    expect(router.url).toBe('/login');
  });

  it('markSessionExpired y clearSessionExpired controlan la señal de sesión expirada', () => {
    service.markSessionExpired();
    expect(service.sessionExpired()).toBe(true);

    service.clearSessionExpired();
    expect(service.sessionExpired()).toBe(false);
  });

  describe('inactividad de sesión', () => {
    beforeEach(() => {
      vi.useFakeTimers();
      api.get.mockReturnValue(of({ user }));
    });

    afterEach(() => {
      vi.useRealTimers();
    });

    it('finaliza la sesión cuando no hay interacción del usuario dentro del límite', async () => {
      api.post.mockReturnValue(of({ user, refreshToken: 'rt-1' }));
      await service.login('a@b.c', 'secreto');
      expect(service.isAuthenticated()).toBe(true);

      vi.advanceTimersByTime(31 * 60 * 1000);

      expect(service.sessionExpired()).toBe(true);
      expect(service.isAuthenticated()).toBe(false);
      expect(service.user()).toBeNull();
      expect(service.getRefreshToken()).toBeNull();
    });

    it('la interacción del usuario mantiene la sesión activa pese al tiempo transcurrido', async () => {
      api.post.mockReturnValue(of({ user, refreshToken: 'rt-1' }));
      await service.login('a@b.c', 'secreto');

      vi.advanceTimersByTime(29 * 60 * 1000);
      window.dispatchEvent(new Event('keydown'));
      vi.advanceTimersByTime(29 * 60 * 1000);

      expect(service.sessionExpired()).toBe(false);
      expect(service.isAuthenticated()).toBe(true);
      expect(service.getRefreshToken()).toBe('rt-1');
    });

    it('no reacciona a la inactividad una vez finalizada la sesión', async () => {
      api.post.mockReturnValue(of({ user, refreshToken: 'rt-1' }));
      await service.login('a@b.c', 'secreto');

      vi.advanceTimersByTime(31 * 60 * 1000);
      expect(service.sessionExpired()).toBe(true);

      vi.advanceTimersByTime(10 * 60 * 1000);

      expect(service.isAuthenticated()).toBe(false);
      expect(service.getRefreshToken()).toBeNull();
    });

    it('usa el límite de inactividad informado por el backend en lugar del default', async () => {
      api.post.mockReturnValue(
        of({ user, refreshToken: 'rt-1', sessionIdleTimeoutMs: 10 * 60 * 1000 }),
      );
      await service.login('a@b.c', 'secreto');

      vi.advanceTimersByTime(11 * 60 * 1000);

      expect(service.sessionExpired()).toBe(true);
      expect(service.isAuthenticated()).toBe(false);
      expect(service.getRefreshToken()).toBeNull();
    });

    it('pausa el latido durante la inactividad y lo reanuda con la interacción', async () => {
      api.post.mockReturnValue(of({ user, refreshToken: 'rt-1' }));
      await service.login('a@b.c', 'secreto');

      vi.advanceTimersByTime(15 * 1000);
      expect(api.get).toHaveBeenCalledTimes(1);

      vi.advanceTimersByTime(60 * 1000);
      expect(api.get).toHaveBeenCalledTimes(4);

      vi.advanceTimersByTime(5 * 60 * 1000);
      expect(api.get).toHaveBeenCalledTimes(4);

      window.dispatchEvent(new Event('pointerdown'));
      vi.advanceTimersByTime(15 * 1000);
      expect(api.get).toHaveBeenCalledTimes(5);
    });
  });

  describe('loginWithGoogle', () => {
    function mockAuth0Client(overrides: {
      loginWithRedirect?: MockFn;
    }): void {
      const client = {
        loginWithRedirect:
          overrides.loginWithRedirect ?? vi.fn().mockResolvedValue(undefined),
      };
      auth0Client.getClient.mockResolvedValue(client);
    }

    it('redirige a Auth0 con la conexión de Google y la URL de retorno actual', async () => {
      const loginWithRedirect = vi.fn().mockResolvedValue(undefined);
      mockAuth0Client({ loginWithRedirect });

      await service.loginWithGoogle();

      expect(auth0Client.getClient).toHaveBeenCalledTimes(1);
      expect(loginWithRedirect).toHaveBeenCalledWith({
        authorizationParams: {
          connection: 'google-oauth2',
          redirect_uri: window.location.origin,
        },
      });
      expect(api.post).not.toHaveBeenCalled();
    });

    it('propaga un error si la redirección a Auth0 falla', async () => {
      const loginWithRedirect = vi.fn().mockRejectedValue(new Error('auth0-down'));
      mockAuth0Client({ loginWithRedirect });

      await expect(service.loginWithGoogle()).rejects.toThrow('auth0-down');
      expect(api.post).not.toHaveBeenCalled();
      expect(service.isAuthenticated()).toBe(false);
    });
  });
});