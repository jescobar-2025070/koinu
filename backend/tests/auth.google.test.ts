import { before, after, describe, it } from 'node:test';
import assert from 'node:assert/strict';
import request from 'supertest';
import { createApp } from '../src/app';
import { pool } from '../src/config/db';
import { AuthService } from '../src/services/auth/auth.service';
import { GoogleIdTokenPayload } from '../src/utils/auth0.utils';
import { UserRepository } from '../src/repositories/user.repository';
import { signAuthToken } from '../src/utils/jwt.utils';
import { setupTestDb, uniqueEmail } from './helpers';

const app = createApp();

before(async () => {
  await setupTestDb();
});

after(async () => {
  await pool.end();
});

let subCounter = 0;
function uniqueSub(): string {
  subCounter += 1;
  return `google-oauth2|test-${Date.now()}-${subCounter}`;
}

/** AuthService con un verificador de token falso, para no depender de una red o tenant de Auth0 reales. */
function authServiceWithFakePayload(payload: GoogleIdTokenPayload): AuthService {
  return new AuthService({ verifyGoogleIdToken: async () => payload });
}

describe('Login/registro con Google (Auth0) - nivel HTTP', () => {
  it('rechaza la solicitud sin idToken', async () => {
    const res = await request(app).post('/api/v1/auth/google').send({});
    assert.equal(res.status, 422);
    assert.equal(res.body.error.code, 'VALIDATION_ERROR');
  });

  it('responde GOOGLE_AUTH_NOT_CONFIGURED cuando Auth0 no está configurado en el servidor', async () => {
    // En el entorno de pruebas no se definen AUTH0_DOMAIN/AUTH0_CLIENT_ID.
    const res = await request(app).post('/api/v1/auth/google').send({ idToken: 'cualquier-token' });
    assert.equal(res.status, 500);
    assert.equal(res.body.error.code, 'GOOGLE_AUTH_NOT_CONFIGURED');
  });
});

describe('Login/registro con Google (Auth0) - lógica de cuenta', () => {
  it('crea un usuario nuevo con rol USR cuando el sub de Google no existe', async () => {
    const email = uniqueEmail();
    const sub = uniqueSub();
    const authService = authServiceWithFakePayload({ sub, email, emailVerified: true, name: 'Nuevo Usuario' });

    const result = await authService.loginWithGoogle('fake-token');

    assert.equal(result.authUser.email, email);
    assert.ok(result.authUser.roles.includes('USR'));
    assert.ok(result.refreshToken);

    const stored = await new UserRepository(pool).findByGoogleSub(sub);
    assert.ok(stored);
    assert.equal(stored!.email, email);
    assert.equal(stored!.authProvider, 'google');
    assert.equal(stored!.passwordHash, null);
  });

  it('inicia sesión sin duplicar la cuenta cuando el sub de Google ya existe', async () => {
    const email = uniqueEmail();
    const sub = uniqueSub();
    const authService = authServiceWithFakePayload({ sub, email, emailVerified: true });

    const first = await authService.loginWithGoogle('fake-token');
    const second = await authService.loginWithGoogle('fake-token');

    assert.equal(first.authUser.id, second.authUser.id);

    const { rows } = await pool.query('SELECT COUNT(*)::int AS count FROM users WHERE google_sub = $1', [sub]);
    assert.equal(rows[0].count, 1);
  });

  it('vincula la cuenta de Google a un usuario existente registrado por el método tradicional', async () => {
    const email = uniqueEmail();
    const password = 'Contrasena123';

    const register = await request(app).post('/api/v1/auth/register').send({ email, password });
    assert.equal(register.status, 201);
    const traditionalUserId = register.body.user.id;

    const sub = uniqueSub();
    const authService = authServiceWithFakePayload({ sub, email, emailVerified: true });
    const result = await authService.loginWithGoogle('fake-token');

    assert.equal(result.authUser.id, traditionalUserId);
    assert.ok(result.authUser.roles.includes('USR'));

    // El login tradicional debe seguir funcionando sin cambios tras la vinculación.
    const login = await request(app).post('/api/v1/auth/login').send({ email, password });
    assert.equal(login.status, 200);
    assert.equal(login.body.user.id, traditionalUserId);
  });

  it('rechaza el token cuando el correo de Google no está verificado', async () => {
    const email = uniqueEmail();
    const sub = uniqueSub();
    const authService = authServiceWithFakePayload({ sub, email, emailVerified: false });

    await assert.rejects(
      () => authService.loginWithGoogle('fake-token'),
      (error: any) => error.code === 'GOOGLE_EMAIL_NOT_VERIFIED',
    );
  });

  it('rechaza el token cuando no incluye correo electrónico y el sub es nuevo', async () => {
    const sub = uniqueSub();
    const authService = authServiceWithFakePayload({ sub, emailVerified: true });

    await assert.rejects(
      () => authService.loginWithGoogle('fake-token'),
      (error: any) => error.code === 'GOOGLE_TOKEN_INVALID',
    );
  });

  it('permite acceder a rutas protegidas tras iniciar sesión con Google', async () => {
    const email = uniqueEmail();
    const sub = uniqueSub();
    const authService = authServiceWithFakePayload({ sub, email, emailVerified: true });
    const result = await authService.loginWithGoogle('fake-token');

    const token = signAuthToken(result.authUser, result.sessionId);
    const me = await request(app).get('/api/v1/auth/me').set('Authorization', `Bearer ${token}`);
    assert.equal(me.status, 200);
    assert.equal(me.body.user.email, email);
  });
});
