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
    name: 'Periodo A6 Test',
    startDate: new Date('2027-02-01'),
    endDate: new Date('2027-02-28'),
    status: 'ACTIVE',
  });
}

async function incomeCategoryId(agent: request.Agent): Promise<string> {
  const res = await agent.get('/api/v1/categories/income');
  return res.body.categorias[0].id;
}

async function expenseCategoryId(agent: request.Agent): Promise<string> {
  const res = await agent.get('/api/v1/categories/expense');
  return res.body.categorias[0].id;
}

describe('Clasificaciones de movimiento (A6)', () => {
  it('crea un ingreso con clasificación normalizada a mayúsculas', async () => {
    const { agent, email } = await registerAndGetAgent();
    const periodo = await setupActivePeriod(agent, email);
    const categoriaId = await incomeCategoryId(agent);

    const res = await agent.post('/api/v1/movements').send({
      periodId: periodo.id,
      type: 'INCOME',
      incomeClassification: 'regular',
      incomeCategoryId: categoriaId,
      grossAmount: 2000,
      retentionAmount: 0,
      date: '2027-02-10',
    });
    assert.equal(res.status, 201);
    assert.equal(res.body.movimiento.incomeClassification, 'REGULAR');
  });

  it('rechaza un ingreso sin clasificación', async () => {
    const { agent, email } = await registerAndGetAgent();
    const periodo = await setupActivePeriod(agent, email);
    const categoriaId = await incomeCategoryId(agent);

    const res = await agent.post('/api/v1/movements').send({
      periodId: periodo.id,
      type: 'INCOME',
      incomeCategoryId: categoriaId,
      grossAmount: 2000,
      retentionAmount: 0,
      date: '2027-02-10',
    });
    assert.equal(res.status, 422);
    assert.equal(res.body.error.code, 'VALIDATION_ERROR');
    assert.ok(res.body.error.details.errors.incomeClassification);
  });

  it('rechaza un ingreso con clasificación inválida', async () => {
    const { agent, email } = await registerAndGetAgent();
    const periodo = await setupActivePeriod(agent, email);
    const categoriaId = await incomeCategoryId(agent);

    const res = await agent.post('/api/v1/movements').send({
      periodId: periodo.id,
      type: 'INCOME',
      incomeClassification: 'EXTRAORDINARIO',
      incomeCategoryId: categoriaId,
      grossAmount: 2000,
      retentionAmount: 0,
      date: '2027-02-10',
    });
    assert.equal(res.status, 422);
    assert.equal(res.body.error.code, 'VALIDATION_ERROR');
  });

  it('crea un gasto con tipo normalizado a mayúsculas', async () => {
    const { agent, email } = await registerAndGetAgent();
    const periodo = await setupActivePeriod(agent, email);
    const categoriaId = await expenseCategoryId(agent);

    const res = await agent.post('/api/v1/movements').send({
      periodId: periodo.id,
      type: 'EXPENSE',
      expenseType: 'fijo',
      expenseCategoryId: categoriaId,
      amount: 500,
      date: '2027-02-10',
    });
    assert.equal(res.status, 201);
    assert.equal(res.body.movimiento.expenseType, 'FIJO');
  });

  it('rechaza un gasto sin tipo', async () => {
    const { agent, email } = await registerAndGetAgent();
    const periodo = await setupActivePeriod(agent, email);
    const categoriaId = await expenseCategoryId(agent);

    const res = await agent.post('/api/v1/movements').send({
      periodId: periodo.id,
      type: 'EXPENSE',
      expenseCategoryId: categoriaId,
      amount: 500,
      date: '2027-02-10',
    });
    assert.equal(res.status, 422);
    assert.equal(res.body.error.code, 'VALIDATION_ERROR');
    assert.ok(res.body.error.details.errors.expenseType);
  });

  it('rechaza un gasto con tipo inválido', async () => {
    const { agent, email } = await registerAndGetAgent();
    const periodo = await setupActivePeriod(agent, email);
    const categoriaId = await expenseCategoryId(agent);

    const res = await agent.post('/api/v1/movements').send({
      periodId: periodo.id,
      type: 'EXPENSE',
      expenseType: 'EXTRAORDINARIO',
      expenseCategoryId: categoriaId,
      amount: 500,
      date: '2027-02-10',
    });
    assert.equal(res.status, 422);
    assert.equal(res.body.error.code, 'VALIDATION_ERROR');
  });

  it('permite editar la clasificación de un ingreso existente', async () => {
    const { agent, email } = await registerAndGetAgent();
    const periodo = await setupActivePeriod(agent, email);
    const categoriaId = await incomeCategoryId(agent);

    const creado = await agent.post('/api/v1/movements').send({
      periodId: periodo.id,
      type: 'INCOME',
      incomeClassification: 'REGULAR',
      incomeCategoryId: categoriaId,
      grossAmount: 2000,
      retentionAmount: 0,
      date: '2027-02-10',
    });
    assert.equal(creado.status, 201);
    const id = creado.body.movimiento.id;

    const editado = await agent.put(`/api/v1/movements/${id}`).send({
      incomeClassification: 'OCASIONAL',
    });
    assert.equal(editado.status, 200);
    assert.equal(editado.body.movimiento.incomeClassification, 'OCASIONAL');

    const consulta = await agent.get(`/api/v1/movements/${id}`);
    assert.equal(consulta.status, 200);
    assert.equal(consulta.body.movimiento.incomeClassification, 'OCASIONAL');
  });

  it('rechaza editar un ingreso con clasificación inválida', async () => {
    const { agent, email } = await registerAndGetAgent();
    const periodo = await setupActivePeriod(agent, email);
    const categoriaId = await incomeCategoryId(agent);

    const creado = await agent.post('/api/v1/movements').send({
      periodId: periodo.id,
      type: 'INCOME',
      incomeClassification: 'REGULAR',
      incomeCategoryId: categoriaId,
      grossAmount: 2000,
      retentionAmount: 0,
      date: '2027-02-10',
    });
    const id = creado.body.movimiento.id;

    const editado = await agent.put(`/api/v1/movements/${id}`).send({
      incomeClassification: 'EXTRAORDINARIO',
    });
    assert.equal(editado.status, 400);
    assert.equal(editado.body.error.code, 'VALIDATION_ERROR');
  });

  it('permite editar el tipo de un gasto existente', async () => {
    const { agent, email } = await registerAndGetAgent();
    const periodo = await setupActivePeriod(agent, email);
    const categoriaId = await expenseCategoryId(agent);

    const creado = await agent.post('/api/v1/movements').send({
      periodId: periodo.id,
      type: 'EXPENSE',
      expenseType: 'FIJO',
      expenseCategoryId: categoriaId,
      amount: 500,
      date: '2027-02-10',
    });
    assert.equal(creado.status, 201);
    const id = creado.body.movimiento.id;

    const editado = await agent.put(`/api/v1/movements/${id}`).send({
      expenseType: 'VARIABLE',
    });
    assert.equal(editado.status, 200);
    assert.equal(editado.body.movimiento.expenseType, 'VARIABLE');
  });
});

describe('Prioridad de objetivos (A6)', () => {
  it('crea un objetivo con prioridad por defecto MEDIA', async () => {
    const { agent } = await registerAndGetAgent();
    const res = await agent.post('/api/v1/objectives').send({
      name: 'Fondo de emergencia',
      targetAmount: 5000,
    });
    assert.equal(res.status, 201);
    assert.equal(res.body.objetivo.priority, 'MEDIA');
  });

  it('crea un objetivo con prioridad normalizada', async () => {
    const { agent } = await registerAndGetAgent();
    const res = await agent.post('/api/v1/objectives').send({
      name: 'Ahorro vacaciones',
      targetAmount: 3000,
      priority: 'alta',
    });
    assert.equal(res.status, 201);
    assert.equal(res.body.objetivo.priority, 'ALTA');
  });

  it('rechaza un objetivo con prioridad inválida', async () => {
    const { agent } = await registerAndGetAgent();
    const res = await agent.post('/api/v1/objectives').send({
      name: 'Ahorro inválido',
      targetAmount: 3000,
      priority: 'CRITICA',
    });
    assert.equal(res.status, 422);
    assert.equal(res.body.error.code, 'VALIDATION_ERROR');
    assert.ok(res.body.error.details.errors.priority);
  });

  it('permite actualizar la prioridad de un objetivo', async () => {
    const { agent } = await registerAndGetAgent();
    const creado = await agent.post('/api/v1/objectives').send({
      name: 'Viaje 2028',
      targetAmount: 10000,
    });
    assert.equal(creado.status, 201);
    const id = creado.body.objetivo.id;

    const editado = await agent.patch(`/api/v1/objectives/${id}`).send({
      priority: 'BAJA',
    });
    assert.equal(editado.status, 200);
    assert.equal(editado.body.objetivo.priority, 'BAJA');

    const consulta = await agent.get(`/api/v1/objectives/${id}`);
    assert.equal(consulta.status, 200);
    assert.equal(consulta.body.objetivo.priority, 'BAJA');
  });

  it('rechaza actualizar un objetivo con prioridad inválida', async () => {
    const { agent } = await registerAndGetAgent();
    const creado = await agent.post('/api/v1/objectives').send({
      name: 'Meta cualquiera',
      targetAmount: 1000,
    });
    const id = creado.body.objetivo.id;

    const editado = await agent.patch(`/api/v1/objectives/${id}`).send({
      priority: 'MEDIO',
    });
    assert.equal(editado.status, 422);
    assert.equal(editado.body.error.code, 'VALIDATION_ERROR');
  });
});