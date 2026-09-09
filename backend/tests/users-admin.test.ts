import { before, after, describe, it } from 'node:test';
import assert from 'node:assert/strict';
import request from 'supertest';
import { createApp } from '../src/app';
import { pool } from '../src/config/db';
import { setupTestDb, uniqueEmail, createUserWithRole } from './helpers';

const app = createApp();

before(async () => {
  await setupTestDb();
});

after(async () => {
  await pool.end();
});

async function loginAs(email: string, password: string) {
  const agent = request.agent(app);
  const res = await agent.post('/api/v1/auth/login').send({ email, password });
  assert.equal(res.status, 200);
  return agent;
}

async function registerUser(password = 'Contrasena123') {
  const email = uniqueEmail();
  const register = await request(app).post('/api/v1/auth/register').send({ email, password });
  assert.equal(register.status, 201);
  return { email, id: register.body.user.id };
}

describe('Administración de usuarios (A1)', () => {
  it('POST /users crea un usuario con rol USR por defecto', async () => {
    const adminEmail = uniqueEmail();
    await createUserWithRole(adminEmail, 'AdminContrasena123', 'ADMIN');
    const agent = await loginAs(adminEmail, 'AdminContrasena123');

    const newEmail = uniqueEmail();
    const res = await agent.post('/api/v1/users').send({
      email: newEmail,
      password: 'Contrasena123',
    });
    assert.equal(res.status, 201);
    assert.equal(res.body.user.email, newEmail);
    assert.deepEqual(res.body.user.roles, ['USR']);
    assert.equal(res.body.user.isActive, true);

    const canLogin = await loginAs(newEmail, 'Contrasena123');
    const me = await canLogin.get('/api/v1/auth/me');
    assert.equal(me.status, 200);
    assert.equal(me.body.user.email, newEmail);
  });

  it('POST /users asigna los roles indicados', async () => {
    const adminEmail = uniqueEmail();
    await createUserWithRole(adminEmail, 'AdminContrasena123', 'ADMIN');
    const agent = await loginAs(adminEmail, 'AdminContrasena123');

    const newEmail = uniqueEmail();
    const res = await agent.post('/api/v1/users').send({
      email: newEmail,
      password: 'Contrasena123',
      roles: ['ADMIN', 'USR'],
    });
    assert.equal(res.status, 201);
    assert.deepEqual(res.body.user.roles.sort(), ['ADMIN', 'USR']);
  });

  it('POST /users rechaza correo duplicado', async () => {
    const adminEmail = uniqueEmail();
    await createUserWithRole(adminEmail, 'AdminContrasena123', 'ADMIN');
    const agent = await loginAs(adminEmail, 'AdminContrasena123');

    const { email } = await registerUser();
    const res = await agent.post('/api/v1/users').send({ email, password: 'Contrasena123' });
    assert.equal(res.status, 409);
    assert.equal(res.body.error.code, 'EMAIL_ALREADY_REGISTERED');
  });

  it('POST /users valida la contraseña', async () => {
    const adminEmail = uniqueEmail();
    await createUserWithRole(adminEmail, 'AdminContrasena123', 'ADMIN');
    const agent = await loginAs(adminEmail, 'AdminContrasena123');

    const res = await agent.post('/api/v1/users').send({ email: uniqueEmail(), password: 'corta1' });
    assert.equal(res.status, 422);
    assert.equal(res.body.error.code, 'VALIDATION_ERROR');
  });

  it('GET /users/:id devuelve el usuario', async () => {
    const adminEmail = uniqueEmail();
    await createUserWithRole(adminEmail, 'AdminContrasena123', 'ADMIN');
    const agent = await loginAs(adminEmail, 'AdminContrasena123');

    const { id, email } = await registerUser();
    const res = await agent.get(`/api/v1/users/${id}`);
    assert.equal(res.status, 200);
    assert.equal(res.body.user.id, id);
    assert.equal(res.body.user.email, email);
    assert.equal(res.body.user.roles[0], 'USR');
  });

  it('GET /users/:id devuelve 404 si no existe', async () => {
    const adminEmail = uniqueEmail();
    await createUserWithRole(adminEmail, 'AdminContrasena123', 'ADMIN');
    const agent = await loginAs(adminEmail, 'AdminContrasena123');

    const res = await agent.get('/api/v1/users/00000000-0000-0000-0000-000000000000');
    assert.equal(res.status, 404);
    assert.equal(res.body.error.code, 'USER_NOT_FOUND');
  });

  it('PATCH /users/:id edita el correo', async () => {
    const adminEmail = uniqueEmail();
    await createUserWithRole(adminEmail, 'AdminContrasena123', 'ADMIN');
    const agent = await loginAs(adminEmail, 'AdminContrasena123');

    const { id } = await registerUser();
    const nuevoEmail = uniqueEmail();
    const res = await agent.patch(`/api/v1/users/${id}`).send({ email: nuevoEmail });
    assert.equal(res.status, 200);
    assert.equal(res.body.user.email, nuevoEmail);
  });

  it('PATCH /users/:id rechaza correo duplicado', async () => {
    const adminEmail = uniqueEmail();
    await createUserWithRole(adminEmail, 'AdminContrasena123', 'ADMIN');
    const agent = await loginAs(adminEmail, 'AdminContrasena123');

    const { id } = await registerUser();
    const { email: otroEmail } = await registerUser();
    const res = await agent.patch(`/api/v1/users/${id}`).send({ email: otroEmail });
    assert.equal(res.status, 409);
    assert.equal(res.body.error.code, 'EMAIL_ALREADY_REGISTERED');
  });

  it('POST /users/:id/reset-password permite iniciar sesión con la nueva contraseña', async () => {
    const adminEmail = uniqueEmail();
    await createUserWithRole(adminEmail, 'AdminContrasena123', 'ADMIN');
    const agent = await loginAs(adminEmail, 'AdminContrasena123');

    const { email } = await registerUser('OldContrasena123');

    const res = await agent
      .post(`/api/v1/users/${(await pool.query<{ id: string }>('SELECT id FROM users WHERE email = $1', [email])).rows[0].id}/reset-password`)
      .send({ password: 'NuevaContrasena123' });
    assert.equal(res.status, 204);

    const oldLogin = await request(app).post('/api/v1/auth/login').send({ email, password: 'OldContrasena123' });
    assert.equal(oldLogin.status, 401);

    const newLogin = await loginAs(email, 'NuevaContrasena123');
    const me = await newLogin.get('/api/v1/auth/me');
    assert.equal(me.status, 200);
  });

  it('rechaza el acceso a un USR (no admin)', async () => {
    const { email, id } = await registerUser();
    const agent = await loginAs(email, 'Contrasena123');

    const list = await agent.get('/api/v1/users');
    assert.equal(list.status, 403);

    const get = await agent.get(`/api/v1/users/${id}`);
    assert.equal(get.status, 403);

    const create = await agent.post('/api/v1/users').send({
      email: uniqueEmail(),
      password: 'Contrasena123',
    });
    assert.equal(create.status, 403);
  });
});