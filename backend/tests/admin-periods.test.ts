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

async function createPeriodFor(email: string, name = 'Agosto 2026') {
  const agent = await loginAs(email, 'Contrasena123');
  const res = await agent.post('/api/v1/periods').send({
    name,
    startDate: '2026-08-01',
    endDate: '2026-08-31',
  });
  assert.equal(res.status, 201);
  return { agent, periodo: res.body.periodo };
}

describe('Administración técnica de períodos (A5)', () => {
  it('GET /admin/periods lista los períodos de todos los usuarios con email y sin datos financieros', async () => {
    const adminEmail = uniqueEmail();
    await createUserWithRole(adminEmail, 'AdminContrasena123', 'ADMIN');
    const adminAgent = await loginAs(adminEmail, 'AdminContrasena123');

    const userEmail = uniqueEmail();
    await createUserWithRole(userEmail, 'Contrasena123', 'USR');
    const { periodo } = await createPeriodFor(userEmail);

    const res = await adminAgent.get('/api/v1/admin/periods');
    assert.equal(res.status, 200);

    const found = res.body.periodos.find((p: any) => p.id === periodo.id);
    assert.ok(found, 'El período del usuario debe aparecer en la lista del admin');
    assert.equal(found.userId, periodo.userId);
    assert.equal(found.userEmail, userEmail);
    assert.equal(found.name, 'Agosto 2026');
    assert.equal(found.status, 'ACTIVE');

    const keys = Object.keys(found).sort();
    assert.deepEqual(keys, [
      'createdAt',
      'deletedAt',
      'endDate',
      'id',
      'name',
      'startDate',
      'status',
      'updatedAt',
      'userEmail',
      'userId',
    ]);
  });

  it('POST /admin/periods/:id/cancel cancela un período activo de otro usuario', async () => {
    const adminEmail = uniqueEmail();
    await createUserWithRole(adminEmail, 'AdminContrasena123', 'ADMIN');
    const adminAgent = await loginAs(adminEmail, 'AdminContrasena123');

    const userEmail = uniqueEmail();
    await createUserWithRole(userEmail, 'Contrasena123', 'USR');
    const { periodo } = await createPeriodFor(userEmail);

    const res = await adminAgent.post(`/api/v1/admin/periods/${periodo.id}/cancel`);
    assert.equal(res.status, 200);
    assert.equal(res.body.periodo.id, periodo.id);
    assert.equal(res.body.periodo.status, 'CANCELLED');
  });

  it('POST /admin/periods/:id/cancel devuelve 404 si el período no existe', async () => {
    const adminEmail = uniqueEmail();
    await createUserWithRole(adminEmail, 'AdminContrasena123', 'ADMIN');
    const adminAgent = await loginAs(adminEmail, 'AdminContrasena123');

    const res = await adminAgent.post('/api/v1/admin/periods/00000000-0000-0000-0000-000000000000/cancel');
    assert.equal(res.status, 404);
    assert.equal(res.body.error.code, 'NOT_FOUND');
  });

  it('POST /admin/periods/:id/cancel rechaza cancelar un período FINISHED', async () => {
    const adminEmail = uniqueEmail();
    await createUserWithRole(adminEmail, 'AdminContrasena123', 'ADMIN');
    const adminAgent = await loginAs(adminEmail, 'AdminContrasena123');

    const userEmail = uniqueEmail();
    await createUserWithRole(userEmail, 'Contrasena123', 'USR');
    const { agent, periodo } = await createPeriodFor(userEmail);

    const finalized = await agent.post(`/api/v1/periods/${periodo.id}/finalize`);
    assert.equal(finalized.status, 200);

    const res = await adminAgent.post(`/api/v1/admin/periods/${periodo.id}/cancel`);
    assert.equal(res.status, 400);
    assert.equal(res.body.error.code, 'VALIDATION_ERROR');
  });

  it('rechaza el acceso a un USR (no admin)', async () => {
    const userEmail = uniqueEmail();
    await createUserWithRole(userEmail, 'Contrasena123', 'USR');
    const agent = await loginAs(userEmail, 'Contrasena123');

    const list = await agent.get('/api/v1/admin/periods');
    assert.equal(list.status, 403);

    const cancel = await agent.post('/api/v1/admin/periods/00000000-0000-0000-0000-000000000000/cancel');
    assert.equal(cancel.status, 403);
  });

  it('rechaza el acceso sin autenticación', async () => {
    const list = await request(app).get('/api/v1/admin/periods');
    assert.equal(list.status, 401);

    const cancel = await request(app).post('/api/v1/admin/periods/00000000-0000-0000-0000-000000000000/cancel');
    assert.equal(cancel.status, 401);
  });
});