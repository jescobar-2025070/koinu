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

async function setupActivePeriod(agent: request.Agent, email: string) {
  const userId = await getUserId(email);
  const repo = new PeriodoRepository(pool);
  return repo.create({
    userId,
    name: 'Periodo M4 Test',
    startDate: new Date('2027-03-01'),
    endDate: new Date('2027-03-31'),
    status: 'ACTIVE',
  });
}

async function incomeCategoryId(agent: request.Agent): Promise<string> {
  const res = await agent.get('/api/v1/categories/income');
  return res.body.categorias[0].id;
}

async function createObjetivo(agent: request.Agent, name: string, targetAmount = 10000): Promise<string> {
  const res = await agent.post('/api/v1/objectives').send({ name, targetAmount });
  assert.equal(res.status, 201);
  return res.body.objetivo.id;
}

async function createIngresoVinculado(agent: request.Agent, periodoId: string, objetivoId: string, grossAmount = 1000) {
  const categoriaId = await incomeCategoryId(agent);
  return agent.post('/api/v1/movements').send({
    periodId: periodoId,
    type: 'INCOME',
    incomeClassification: 'REGULAR',
    incomeCategoryId: categoriaId,
    objetivoId,
    grossAmount,
    retentionAmount: 0,
    date: '2027-03-10',
  });
}

describe('Vínculo movimientos↔objetivos (M4)', () => {
  it('crea un ingreso marcado y suma el neto al objetivo', async () => {
    const { agent, email } = await registerAndGetAgent();
    const periodo = await setupActivePeriod(agent, email);
    const objetivoId = await createObjetivo(agent, 'Computadora');

    const creado = await createIngresoVinculado(agent, periodo.id, objetivoId, 2000);
    assert.equal(creado.status, 201);
    assert.equal(creado.body.movimiento.objetivoId, objetivoId);

    const consulta = await agent.get(`/api/v1/objectives/${objetivoId}`);
    assert.equal(consulta.status, 200);
    assert.equal(Number(consulta.body.objetivo.currentAmount), 2000);
  });

  it('usa el neto (bruto - retención) como aporte', async () => {
    const { agent, email } = await registerAndGetAgent();
    const periodo = await setupActivePeriod(agent, email);
    const objetivoId = await createObjetivo(agent, 'Vacaciones');
    const categoriaId = await incomeCategoryId(agent);

    const creado = await agent.post('/api/v1/movements').send({
      periodId: periodo.id,
      type: 'INCOME',
      incomeClassification: 'OCASIONAL',
      incomeCategoryId: categoriaId,
      objetivoId,
      grossAmount: 2000,
      retentionAmount: 500,
      date: '2027-03-12',
    });
    assert.equal(creado.status, 201);

    const consulta = await agent.get(`/api/v1/objectives/${objetivoId}`);
    assert.equal(Number(consulta.body.objetivo.currentAmount), 1500);
  });

  it('no altera el objetivo si el ingreso no está marcado', async () => {
    const { agent, email } = await registerAndGetAgent();
    const periodo = await setupActivePeriod(agent, email);
    const objetivoId = await createObjetivo(agent, 'Fondo');
    const categoriaId = await incomeCategoryId(agent);

    const creado = await agent.post('/api/v1/movements').send({
      periodId: periodo.id,
      type: 'INCOME',
      incomeClassification: 'REGULAR',
      incomeCategoryId: categoriaId,
      grossAmount: 1000,
      retentionAmount: 0,
      date: '2027-03-10',
    });
    assert.equal(creado.status, 201);
    assert.equal(creado.body.movimiento.objetivoId, null);

    const consulta = await agent.get(`/api/v1/objectives/${objetivoId}`);
    assert.equal(Number(consulta.body.objetivo.currentAmount), 0);
  });

  it('rechaza vincular un gasto a un objetivo', async () => {
    const { agent, email } = await registerAndGetAgent();
    const periodo = await setupActivePeriod(agent, email);
    const objetivoId = await createObjetivo(agent, 'Meta');
    const categorias = await agent.get('/api/v1/categories/expense');
    const categoriaId = categorias.body.categorias[0].id;

    const creado = await agent.post('/api/v1/movements').send({
      periodId: periodo.id,
      type: 'EXPENSE',
      expenseType: 'FIJO',
      expenseCategoryId: categoriaId,
      objetivoId,
      amount: 300,
      date: '2027-03-10',
    });
    assert.equal(creado.status, 422);
    assert.equal(creado.body.error.code, 'VALIDATION_ERROR');
    assert.ok(creado.body.error.details.errors.objetivoId);
  });

  it('rechaza un objetivo que pertenece a otro usuario', async () => {
    const userA = await registerAndGetAgent();
    const userB = await registerAndGetAgent();
    const periodo = await setupActivePeriod(userA.agent, userA.email);
    const objetivoId = await createObjetivo(userB.agent, 'Ajeno');

    const creado = await createIngresoVinculado(userA.agent, periodo.id, objetivoId, 1000);
    assert.equal(creado.status, 403);
    assert.equal(creado.body.error.code, 'FORBIDDEN');
  });

  it('rechaza vincular a un objetivo inexistente', async () => {
    const { agent, email } = await registerAndGetAgent();
    const periodo = await setupActivePeriod(agent, email);

    const creado = await createIngresoVinculado(agent, periodo.id, '00000000-0000-0000-0000-000000000000', 1000);
    assert.equal(creado.status, 404);
    assert.equal(creado.body.error.code, 'NOT_FOUND');
  });

  it('rechaza vincular a un objetivo completado', async () => {
    const { agent, email } = await registerAndGetAgent();
    const periodo = await setupActivePeriod(agent, email);
    const objetivoId = await createObjetivo(agent, 'Completado', 100);

    const completo = await agent.post(`/api/v1/objectives/${objetivoId}/complete`);
    assert.equal(completo.status, 200);

    const creado = await createIngresoVinculado(agent, periodo.id, objetivoId, 1000);
    assert.equal(creado.status, 422);
    assert.equal(creado.body.error.code, 'GOAL_NOT_ACTIVE');
  });

  it('ajusta el objetivo al editar el monto del ingreso vinculado', async () => {
    const { agent, email } = await registerAndGetAgent();
    const periodo = await setupActivePeriod(agent, email);
    const objetivoId = await createObjetivo(agent, 'Ajuste');
    const creado = await createIngresoVinculado(agent, periodo.id, objetivoId, 1000);
    const movimientoId = creado.body.movimiento.id;

    const editado = await agent.put(`/api/v1/movements/${movimientoId}`).send({
      grossAmount: 1500,
      retentionAmount: 0,
    });
    assert.equal(editado.status, 200);

    const consulta = await agent.get(`/api/v1/objectives/${objetivoId}`);
    assert.equal(Number(consulta.body.objetivo.currentAmount), 1500);
  });

  it('transfiere el aporte al cambiar el ingreso de objetivo (reviierte el anterior y suma al nuevo)', async () => {
    const { agent, email } = await registerAndGetAgent();
    const periodo = await setupActivePeriod(agent, email);
    const objetivoA = await createObjetivo(agent, 'Objetivo A');
    const objetivoB = await createObjetivo(agent, 'Objetivo B');
    const creado = await createIngresoVinculado(agent, periodo.id, objetivoA, 2000);
    const movimientoId = creado.body.movimiento.id;

    const editado = await agent.put(`/api/v1/movements/${movimientoId}`).send({
      objetivoId: objetivoB,
    });
    assert.equal(editado.status, 200);
    assert.equal(editado.body.movimiento.objetivoId, objetivoB);

    const consultaA = await agent.get(`/api/v1/objectives/${objetivoA}`);
    assert.equal(Number(consultaA.body.objetivo.currentAmount), 0);
    const consultaB = await agent.get(`/api/v1/objectives/${objetivoB}`);
    assert.equal(Number(consultaB.body.objetivo.currentAmount), 2000);
  });

  it('reviierte el aporte al desvincular el ingreso del objetivo', async () => {
    const { agent, email } = await registerAndGetAgent();
    const periodo = await setupActivePeriod(agent, email);
    const objetivoId = await createObjetivo(agent, 'Desvinculable');
    const creado = await createIngresoVinculado(agent, periodo.id, objetivoId, 1000);
    const movimientoId = creado.body.movimiento.id;

    const editado = await agent.put(`/api/v1/movements/${movimientoId}`).send({
      objetivoId: null,
    });
    assert.equal(editado.status, 200);
    assert.equal(editado.body.movimiento.objetivoId, null);

    const consulta = await agent.get(`/api/v1/objectives/${objetivoId}`);
    assert.equal(Number(consulta.body.objetivo.currentAmount), 0);
  });

  it('reviierte el aporte al eliminar el ingreso vinculado', async () => {
    const { agent, email } = await registerAndGetAgent();
    const periodo = await setupActivePeriod(agent, email);
    const objetivoId = await createObjetivo(agent, 'Eliminable');
    const creado = await createIngresoVinculado(agent, periodo.id, objetivoId, 1000);
    const movimientoId = creado.body.movimiento.id;

    const eliminado = await agent.delete(`/api/v1/movements/${movimientoId}`);
    assert.equal(eliminado.status, 204);

    const consulta = await agent.get(`/api/v1/objectives/${objetivoId}`);
    assert.equal(Number(consulta.body.objetivo.currentAmount), 0);
  });

  it('rechaza vincular un gasto a un objetivo al editar', async () => {
    const { agent, email } = await registerAndGetAgent();
    const periodo = await setupActivePeriod(agent, email);
    const objetivoId = await createObjetivo(agent, 'Meta gasto');
    const categorias = await agent.get('/api/v1/categories/expense');
    const categoriaId = categorias.body.categorias[0].id;

    const creado = await agent.post('/api/v1/movements').send({
      periodId: periodo.id,
      type: 'EXPENSE',
      expenseType: 'FIJO',
      expenseCategoryId: categoriaId,
      amount: 300,
      date: '2027-03-10',
    });
    assert.equal(creado.status, 201);
    const movimientoId = creado.body.movimiento.id;

    const editado = await agent.put(`/api/v1/movements/${movimientoId}`).send({
      objetivoId,
    });
    assert.equal(editado.status, 400);
    assert.equal(editado.body.error.code, 'VALIDATION_ERROR');
  });
});