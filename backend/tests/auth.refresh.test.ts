import { before, after, describe, it } from 'node:test';
import assert from 'node:assert/strict';
import request from 'supertest';
import { createApp } from '../src/app';
import { pool } from '../src/config/db';
import { config } from '../src/config/env';
import { setupTestDb, uniqueEmail } from './helpers';

const app = createApp();

const IDLE_MS = config.sessionIdleTimeoutMs;

before(async () => {
  await setupTestDb();
});

after(async () => {
  await pool.end();
});

async function registerAndLogin(): Promise<{
  agent: request.Agent;
  email: string;
  refreshToken: string;
  userId: string;
}> {
  const email = uniqueEmail();
  const password = 'Contrasena123';
  const register = await request(app).post('/api/v1/auth/register').send({ email, password });
  assert.equal(register.status, 201);
  assert.ok(register.body.user.id);

  const agent = request.agent(app);
  const login = await agent.post('/api/v1/auth/login').send({ email, password });
  assert.equal(login.status, 200);
  assert.ok(login.body.refreshToken, 'El login debe devolver un refresh token');

  return {
    agent,
    email,
    refreshToken: login.body.refreshToken,
    userId: register.body.user.id,
  };
}

async function setIdleTime(userId: string, msAgo: number): Promise<void> {
  await pool.query(
    `UPDATE refresh_tokens
        SET last_used_at = NOW() - ($2::int || ' milliseconds')::interval
      WHERE user_id = $1 AND revoked_at IS NULL`,
    [userId, msAgo],
  );
}

async function setExpiryTime(userId: string, msAgo: number): Promise<void> {
  await pool.query(
    `UPDATE refresh_tokens
        SET expires_at = NOW() - ($2::int || ' milliseconds')::interval
      WHERE user_id = $1 AND revoked_at IS NULL`,
    [userId, msAgo],
  );
}

describe('Refresh token - rotación y renovación', () => {
  it('el login genera un refresh token y un access token válido', async () => {
    const { agent, email } = await registerAndLogin();

    const me = await agent.get('/api/v1/auth/me');
    assert.equal(me.status, 200);
    assert.equal(me.body.user.email, email);
  });

  it('refresh rota el token y permite usarlo con el nuevo access token', async () => {
    const { refreshToken } = await registerAndLogin();

    const agent = request.agent(app);
    const first = await agent.post('/api/v1/auth/refresh').send({ refreshToken });
    assert.equal(first.status, 200);
    assert.ok(first.body.refreshToken);
    assert.notEqual(first.body.refreshToken, refreshToken);

    const me = await agent.get('/api/v1/auth/me');
    assert.equal(me.status, 200);
  });

  it('rechaza un refresh token ya rotado', async () => {
    const { refreshToken } = await registerAndLogin();

    const agent = request.agent(app);
    const first = await agent.post('/api/v1/auth/refresh').send({ refreshToken });
    assert.equal(first.status, 200);

    const second = await agent.post('/api/v1/auth/refresh').send({ refreshToken });
    assert.equal(second.status, 401);
    assert.equal(second.body.error.code, 'REFRESH_TOKEN_INVALID');
  });

  it('refresca la actividad de la sesión en cada refresh', async () => {
    const { refreshToken } = await registerAndLogin();

    const agent = request.agent(app);
    const first = await agent.post('/api/v1/auth/refresh').send({ refreshToken });
    assert.equal(first.status, 200);

    const second = await agent.post('/api/v1/auth/refresh').send({
      refreshToken: first.body.refreshToken,
    });
    assert.equal(second.status, 200);
  });
});

describe('Refresh token - expiración por inactividad', () => {
  it('rechaza el refresh cuando la sesión superó el tiempo de inactividad', async () => {
    const { refreshToken, userId } = await registerAndLogin();

    await setIdleTime(userId, IDLE_MS + 60_000);

    const res = await request(app)
      .post('/api/v1/auth/refresh')
      .send({ refreshToken });

    assert.equal(res.status, 401);
    assert.equal(res.body.error.code, 'SESSION_IDLE_EXPIRED');
  });

  it('permite el refresh si la inactividad está dentro del límite', async () => {
    const { refreshToken, userId } = await registerAndLogin();

    await setIdleTime(userId, Math.max(0, IDLE_MS - 60_000));

    const res = await request(app)
      .post('/api/v1/auth/refresh')
      .send({ refreshToken });

    assert.equal(res.status, 200);
  });

  it('rechaza los requests autenticados con sesión inactiva', async () => {
    const { agent, userId } = await registerAndLogin();

    await setIdleTime(userId, IDLE_MS + 60_000);

    const me = await agent.get('/api/v1/auth/me');
    assert.equal(me.status, 401);
    assert.equal(me.body.error.code, 'SESSION_IDLE_EXPIRED');
  });
});

describe('Refresh token - expiración absoluta', () => {
  it('rechaza el refresh cuando venció la duración máxima del token', async () => {
    const { refreshToken, userId } = await registerAndLogin();

    await setExpiryTime(userId, 1000);

    const res = await request(app)
      .post('/api/v1/auth/refresh')
      .send({ refreshToken });

    assert.equal(res.status, 401);
    assert.equal(res.body.error.code, 'REFRESH_TOKEN_EXPIRED');
  });
});

describe('Refresh token - actividad registrada en requests autenticados', () => {
  it('actualiza last_used_at al hacer un request autenticado', async () => {
    const { agent, userId } = await registerAndLogin();

    await setIdleTime(userId, 10 * 60 * 1000);

    const me = await agent.get('/api/v1/auth/me');
    assert.equal(me.status, 200);

    const { rows } = await pool.query<{ last_used_at: Date }>(
      `SELECT last_used_at FROM refresh_tokens WHERE user_id = $1 AND revoked_at IS NULL LIMIT 1`,
      [userId],
    );
    const lastUsedMs = new Date(rows[0].last_used_at).getTime();
    assert.ok(Date.now() - lastUsedMs < 10_000, `last_used_at debería estar reciente (${lastUsedMs})`);
  });
});

describe('Refresh token - logout', () => {
  it('invalida todos los refresh tokens al cerrar sesión', async () => {
    const { agent, refreshToken } = await registerAndLogin();

    const logout = await agent.post('/api/v1/auth/logout');
    assert.equal(logout.status, 204);

    const res = await request(app)
      .post('/api/v1/auth/refresh')
      .send({ refreshToken });

    assert.equal(res.status, 401);
    assert.equal(res.body.error.code, 'REFRESH_TOKEN_INVALID');
  });

  it('rechaza requests autenticados con la sesión revocada tras el logout', async () => {
    const { agent } = await registerAndLogin();

    const logout = await agent.post('/api/v1/auth/logout');
    assert.equal(logout.status, 204);

    const me = await agent.get('/api/v1/auth/me');
    assert.equal(me.status, 401);
  });
});