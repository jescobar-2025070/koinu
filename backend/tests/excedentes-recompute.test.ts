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
    name: 'Periodo Excedentes Test',
    startDate: new Date('2027-05-01'),
    endDate: new Date('2027-05-31'),
    status: 'ACTIVE',
  });
}

async function addIncome(agent: request.Agent, periodId: string, grossAmount: number) {
  const categorias = await agent.get('/api/v1/categories/income');
  const categoriaId = categorias.body.categorias[0].id;
  return agent.post('/api/v1/movements').send({
    periodId,
    type: 'INCOME',
    incomeClassification: 'REGULAR',
    incomeCategoryId: categoriaId,
    grossAmount,
    retentionAmount: 0,
    date: '2027-05-05',
  });
}

async function addExpense(agent: request.Agent, periodId: string, amount: number) {
  const categorias = await agent.get('/api/v1/categories/expense');
  const categoriaId = categorias.body.categorias[0].id;
  return agent.post('/api/v1/movements').send({
    periodId,
    type: 'EXPENSE',
    expenseType: 'VARIABLE',
    expenseCategoryId: categoriaId,
    amount,
    date: '2027-05-10',
  });
}

async function getOverruns(agent: request.Agent, periodId: string) {
  const res = await agent.get(`/api/v1/periods/${periodId}/budget/overruns`);
  assert.equal(res.status, 200);
  return res.body;
}

describe('Reconciliación de excedentes (C3)', () => {
  it('crea excedentes por cada gasto que sobrepasa el presupuesto, con su movimientoId', async () => {
    const { agent, email } = await registerAndGetAgent();
    const periodo = await setupActivePeriod(agent, email);

    const ingreso = await addIncome(agent, periodo.id, 5000);
    assert.equal(ingreso.status, 201);

    await agent.post(`/api/v1/periods/${periodo.id}/budget`);

    const g1 = await addExpense(agent, periodo.id, 4000);
    const g2 = await addExpense(agent, periodo.id, 2000);
    assert.equal(g1.status, 201);
    assert.equal(g2.status, 201);

    const overruns = await getOverruns(agent, periodo.id);
    assert.equal(Number(overruns.excedenteTotal), 1000);
    assert.equal(overruns.excedentes.length, 1);
    assert.equal(overruns.excedentes[0].movimientoId, g2.body.movimiento.id);
    assert.equal(Number(overruns.excedentes[0].amount), 1000);
  });

  it('acumula el excedente progresivamente y lo atribuye a cada gasto', async () => {
    const { agent, email } = await registerAndGetAgent();
    const periodo = await setupActivePeriod(agent, email);

    const ingreso = await addIncome(agent, periodo.id, 5000);
    assert.equal(ingreso.status, 201);

    await agent.post(`/api/v1/periods/${periodo.id}/budget`);

    const g1 = await addExpense(agent, periodo.id, 6000);
    const g2 = await addExpense(agent, periodo.id, 1000);

    const overruns = await getOverruns(agent, periodo.id);
    assert.equal(overruns.excedentes.length, 2);
    assert.equal(Number(overruns.excedenteTotal), 2000);
    const e1 = overruns.excedentes.find((e: any) => e.movimientoId === g1.body.movimiento.id);
    const e2 = overruns.excedentes.find((e: any) => e.movimientoId === g2.body.movimiento.id);
    assert.equal(Number(e1.amount), 1000);
    assert.equal(Number(e2.amount), 1000);
  });

  it('al editar un gasto recalcula excedentes sin duplicados', async () => {
    const { agent, email } = await registerAndGetAgent();
    const periodo = await setupActivePeriod(agent, email);

    const ingreso = await addIncome(agent, periodo.id, 5000);
    assert.equal(ingreso.status, 201);

    await agent.post(`/api/v1/periods/${periodo.id}/budget`);

    const g1 = await addExpense(agent, periodo.id, 4000);
    const g2 = await addExpense(agent, periodo.id, 2000);
    const g2Id = g2.body.movimiento.id;

    const editado = await agent.put(`/api/v1/movements/${g2Id}`).send({ amount: 1500 });
    assert.equal(editado.status, 200);

    const overruns = await getOverruns(agent, periodo.id);
    assert.equal(overruns.excedentes.length, 1);
    assert.equal(Number(overruns.excedenteTotal), 500);
    assert.equal(overruns.excedentes[0].movimientoId, g2Id);
    assert.equal(Number(overruns.excedentes[0].amount), 500);

    const quitaSobrepaso = await agent.put(`/api/v1/movements/${g2Id}`).send({ amount: 500 });
    assert.equal(quitaSobrepaso.status, 200);

    const sinExcedentes = await getOverruns(agent, periodo.id);
    assert.equal(sinExcedentes.excedentes.length, 0);
    assert.equal(Number(sinExcedentes.excedenteTotal), 0);
  });

  it('eliminar un gasto elimina el excedente asociado', async () => {
    const { agent, email } = await registerAndGetAgent();
    const periodo = await setupActivePeriod(agent, email);

    const ingreso = await addIncome(agent, periodo.id, 5000);
    assert.equal(ingreso.status, 201);

    await agent.post(`/api/v1/periods/${periodo.id}/budget`);

    const g1 = await addExpense(agent, periodo.id, 4000);
    const g2 = await addExpense(agent, periodo.id, 2000);
    const g2Id = g2.body.movimiento.id;

    const before = await getOverruns(agent, periodo.id);
    assert.equal(before.excedentes.length, 1);

    const del = await agent.delete(`/api/v1/movements/${g2Id}`);
    assert.equal(del.status, 204);

    const after = await getOverruns(agent, periodo.id);
    assert.equal(after.excedentes.length, 0);
    assert.equal(Number(after.excedenteTotal), 0);
  });

  it('sin gastos no hay excedentes aunque exista presupuesto', async () => {
    const { agent, email } = await registerAndGetAgent();
    const periodo = await setupActivePeriod(agent, email);

    const ingreso = await addIncome(agent, periodo.id, 5000);
    assert.equal(ingreso.status, 201);

    await agent.post(`/api/v1/periods/${periodo.id}/budget`);

    const overruns = await getOverruns(agent, periodo.id);
    assert.equal(overruns.excedentes.length, 0);
    assert.equal(Number(overruns.excedenteTotal), 0);
  });

  it('al editar un ingreso recalcula el umbral del presupuesto', async () => {
    const { agent, email } = await registerAndGetAgent();
    const periodo = await setupActivePeriod(agent, email);

    const ingreso = await addIncome(agent, periodo.id, 5000);
    const ingresoId = ingreso.body.movimiento.id;

    await agent.post(`/api/v1/periods/${periodo.id}/budget`);

    const g1 = await addExpense(agent, periodo.id, 6000);
    assert.equal(g1.status, 201);

    const before = await getOverruns(agent, periodo.id);
    assert.equal(before.excedentes.length, 1);
    assert.equal(Number(before.excedenteTotal), 1000);

    const editado = await agent.put(`/api/v1/movements/${ingresoId}`).send({
      grossAmount: 7000,
      retentionAmount: 0,
    });
    assert.equal(editado.status, 200);

    const after = await getOverruns(agent, periodo.id);
    assert.equal(after.excedentes.length, 0);
    assert.equal(Number(after.excedenteTotal), 0);
  });
});