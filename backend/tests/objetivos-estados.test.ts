import { before, after, describe, it } from 'node:test';
import assert from 'node:assert/strict';
import request from 'supertest';
import { createApp } from '../src/app';
import { pool } from '../src/config/db';
import { setupTestDb, uniqueEmail } from './helpers';
import { PeriodoRepository } from '../src/repositories/periodo.repository';

const app = createApp();

before(async () => {
  await setupTestDb();
});

after(async () => {
  await pool.end();
});

async function registerAndGetAgent() {
  const email = uniqueEmail();
  const password = 'Contrasena123';
  const register = await request(app).post('/api/v1/auth/register').send({ email, password });
  assert.equal(register.status, 201);

  const agent = request.agent(app);
  const login = await agent.post('/api/v1/auth/login').send({ email, password });
  assert.equal(login.status, 200);
  return { agent, email, password };
}

async function getUserId(email: string): Promise<string> {
  const res = await pool.query<{ id: string }>('SELECT id FROM users WHERE email = $1', [email]);
  return res.rows[0].id;
}

async function createObjetivo(agent: request.Agent, name: string, targetAmount = 10000): Promise<string> {
  const res = await agent.post('/api/v1/objectives').send({ name, targetAmount });
  assert.equal(res.status, 201);
  return res.body.objetivo.id;
}

async function getObjetivo(agent: request.Agent, id: string) {
  const res = await agent.get(`/api/v1/objectives/${id}`);
  assert.equal(res.status, 200);
  return res.body.objetivo;
}

describe('Estados de objetivos (B4)', () => {
  it('completa un objetivo activo y persiste el estado COMPLETED', async () => {
    const { agent } = await registerAndGetAgent();
    const objetivoId = await createObjetivo(agent, 'Ahorro coche');

    const res = await agent.post(`/api/v1/objectives/${objetivoId}/complete`);
    assert.equal(res.status, 200);
    assert.equal(res.body.objetivo.id, objetivoId);
    assert.equal(res.body.objetivo.status, 'COMPLETED');

    const consulta = await getObjetivo(agent, objetivoId);
    assert.equal(consulta.status, 'COMPLETED');
  });

  it('cancela un objetivo activo y persiste el estado CANCELLED', async () => {
    const { agent } = await registerAndGetAgent();
    const objetivoId = await createObjetivo(agent, 'Viaje postergado');

    const res = await agent.post(`/api/v1/objectives/${objetivoId}/cancel`);
    assert.equal(res.status, 200);
    assert.equal(res.body.objetivo.status, 'CANCELLED');

    const consulta = await getObjetivo(agent, objetivoId);
    assert.equal(consulta.status, 'CANCELLED');
  });

  it('sigue listando y consultando objetivos completados o cancelados', async () => {
    const { agent } = await registerAndGetAgent();
    const completado = await createObjetivo(agent, 'Meta cumplida');
    const cancelado = await createObjetivo(agent, 'Meta descartada');
    await agent.post(`/api/v1/objectives/${completado}/complete`);
    await agent.post(`/api/v1/objectives/${cancelado}/cancel`);

    const lista = await agent.get('/api/v1/objectives');
    assert.equal(lista.status, 200);
    const ids = lista.body.objetivos.map((o: { id: string }) => o.id);
    assert.ok(ids.includes(completado));
    assert.ok(ids.includes(cancelado));
    assert.equal(lista.body.objetivos.find((o: { id: string }) => o.id === completado).status, 'COMPLETED');
    assert.equal(lista.body.objetivos.find((o: { id: string }) => o.id === cancelado).status, 'CANCELLED');
  });

  it('no permite completar un objetivo ya completado (422 GOAL_NOT_ACTIVE)', async () => {
    const { agent } = await registerAndGetAgent();
    const objetivoId = await createObjetivo(agent, 'Doble completar');
    await agent.post(`/api/v1/objectives/${objetivoId}/complete`);

    const res = await agent.post(`/api/v1/objectives/${objetivoId}/complete`);
    assert.equal(res.status, 422);
    assert.equal(res.body.error.code, 'GOAL_NOT_ACTIVE');
  });

  it('no permite completar ni cancelar un objetivo cancelado (422 GOAL_NOT_ACTIVE)', async () => {
    const { agent } = await registerAndGetAgent();
    const objetivoId = await createObjetivo(agent, 'Ya cancelado');
    await agent.post(`/api/v1/objectives/${objetivoId}/cancel`);

    const complete = await agent.post(`/api/v1/objectives/${objetivoId}/complete`);
    assert.equal(complete.status, 422);
    assert.equal(complete.body.error.code, 'GOAL_NOT_ACTIVE');

    const cancel = await agent.post(`/api/v1/objectives/${objetivoId}/cancel`);
    assert.equal(cancel.status, 422);
    assert.equal(cancel.body.error.code, 'GOAL_NOT_ACTIVE');
  });

  it('no permite cancelar un objetivo completado (422 GOAL_NOT_ACTIVE)', async () => {
    const { agent } = await registerAndGetAgent();
    const objetivoId = await createObjetivo(agent, 'Completado irreversible');
    await agent.post(`/api/v1/objectives/${objetivoId}/complete`);

    const res = await agent.post(`/api/v1/objectives/${objetivoId}/cancel`);
    assert.equal(res.status, 422);
    assert.equal(res.body.error.code, 'GOAL_NOT_ACTIVE');
  });

  it('no permite completar ni cancelar un objetivo ajeno (403)', async () => {
    const { agent: dueno, email: duenoEmail } = await registerAndGetAgent();
    const objetivoId = await createObjetivo(dueno, 'Ajeno');

    const { agent: intruso } = await registerAndGetAgent();
    await getUserId(duenoEmail);

    const complete = await intruso.post(`/api/v1/objectives/${objetivoId}/complete`);
    assert.equal(complete.status, 403);
    assert.equal(complete.body.error.code, 'FORBIDDEN');

    const cancel = await intruso.post(`/api/v1/objectives/${objetivoId}/cancel`);
    assert.equal(cancel.status, 403);
    assert.equal(cancel.body.error.code, 'FORBIDDEN');
  });

  it('no permite completar ni cancelar un objetivo inexistente (404)', async () => {
    const { agent } = await registerAndGetAgent();
    const inexistente = '00000000-0000-0000-0000-000000000000';

    const complete = await agent.post(`/api/v1/objectives/${inexistente}/complete`);
    assert.equal(complete.status, 404);
    assert.equal(complete.body.error.code, 'NOT_FOUND');

    const cancel = await agent.post(`/api/v1/objectives/${inexistente}/cancel`);
    assert.equal(cancel.status, 404);
    assert.equal(cancel.body.error.code, 'NOT_FOUND');
  });

  it('no permite aportar ni retirar de un objetivo completado (422 GOAL_NOT_ACTIVE)', async () => {
    const { agent } = await registerAndGetAgent();
    const objetivoId = await createObjetivo(agent, 'Congelado por completo');
    await agent.post(`/api/v1/objectives/${objetivoId}/complete`);

    const aporte = await agent.post(`/api/v1/objectives/${objetivoId}/contributions`).send({ amount: 500 });
    assert.equal(aporte.status, 422);
    assert.equal(aporte.body.error.code, 'GOAL_NOT_ACTIVE');

    const retiro = await agent.post(`/api/v1/objectives/${objetivoId}/withdrawals`).send({ amount: 100 });
    assert.equal(retiro.status, 422);
    assert.equal(retiro.body.error.code, 'GOAL_NOT_ACTIVE');
  });

  it('no permite aportar ni retirar de un objetivo cancelado (422 GOAL_NOT_ACTIVE)', async () => {
    const { agent } = await registerAndGetAgent();
    const objetivoId = await createObjetivo(agent, 'Congelado por cancelación');
    await agent.post(`/api/v1/objectives/${objetivoId}/cancel`);

    const aporte = await agent.post(`/api/v1/objectives/${objetivoId}/contributions`).send({ amount: 500 });
    assert.equal(aporte.status, 422);
    assert.equal(aporte.body.error.code, 'GOAL_NOT_ACTIVE');

    const retiro = await agent.post(`/api/v1/objectives/${objetivoId}/withdrawals`).send({ amount: 100 });
    assert.equal(retiro.status, 422);
    assert.equal(retiro.body.error.code, 'GOAL_NOT_ACTIVE');
  });

  it('rechaza vincular un ingreso a un objetivo cancelado (422 GOAL_NOT_ACTIVE)', async () => {
    const { agent, email } = await registerAndGetAgent();
    const userId = await getUserId(email);
    const repo = new PeriodoRepository(pool);
    const periodo = await repo.create({
      userId,
      name: 'Periodo B4 Test',
      startDate: new Date('2028-02-01'),
      endDate: new Date('2028-02-28'),
      status: 'ACTIVE',
    });

    const objetivoId = await createObjetivo(agent, 'Sin aportes futuros');
    await agent.post(`/api/v1/objectives/${objetivoId}/cancel`);

    const categoria = await agent.get('/api/v1/categories/income');
    const categoriaId = categoria.body.categorias[0].id;

    const creado = await agent.post('/api/v1/movements').send({
      periodId: periodo.id,
      type: 'INCOME',
      incomeClassification: 'REGULAR',
      incomeCategoryId: categoriaId,
      objetivoId,
      grossAmount: 1000,
      retentionAmount: 0,
      date: '2028-02-10',
    });
    assert.equal(creado.status, 422);
    assert.equal(creado.body.error.code, 'GOAL_NOT_ACTIVE');
  });
});