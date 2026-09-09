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
    name: 'Periodo Redistribución Test',
    startDate: new Date('2027-06-01'),
    endDate: new Date('2027-06-30'),
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
    date: '2027-06-05',
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
    date: '2027-06-10',
  });
}

async function listExpenseCategories(agent: request.Agent) {
  const res = await agent.get('/api/v1/categories/expense');
  assert.equal(res.status, 200);
  return res.body.categorias as { id: string; name: string }[];
}

async function syncBudget(agent: request.Agent, periodId: string) {
  const res = await agent.post(`/api/v1/periods/${periodId}/budget`);
  assert.equal(res.status, 200);
}

async function allocate(
  agent: request.Agent,
  periodId: string,
  categoriaGastoId: string,
  amount: number,
) {
  const res = await agent.post(`/api/v1/periods/${periodId}/budget/allocations`).send({
    categoriaGastoId,
    amount,
  });
  assert.equal(res.status, 201);
  return res.body.asignacion;
}

async function getRedistribution(agent: request.Agent, periodId: string) {
  const res = await agent.get(`/api/v1/periods/${periodId}/budget/redistribution`);
  assert.equal(res.status, 200);
  return res.body.redistribution;
}

describe('Gestión de excedentes — redistribución (B3)', () => {
  it('sin presupuesto: propuesta no redistribuible con motivo SIN_PRESUPUESTO', async () => {
    const { agent, email } = await registerAndGetAgent();
    const periodo = await setupActivePeriod(agent, email);

    const propuesta = await getRedistribution(agent, periodo.id);
    assert.equal(propuesta.redistribuible, false);
    assert.equal(propuesta.motivo, 'SIN_PRESUPUESTO');
    assert.deepEqual(propuesta.ajustes, []);
  });

  it('aplicar sin presupuesto responde 404 BUDGET_NOT_FOUND', async () => {
    const { agent, email } = await registerAndGetAgent();
    const periodo = await setupActivePeriod(agent, email);

    const res = await agent.post(`/api/v1/periods/${periodo.id}/budget/redistribute`);
    assert.equal(res.status, 404);
    assert.equal(res.body.error.code, 'BUDGET_NOT_FOUND');
  });

  it('sin excedentes la propuesta no es redistribuible (SIN_EXCEDENTE)', async () => {
    const { agent, email } = await registerAndGetAgent();
    const periodo = await setupActivePeriod(agent, email);

    const ingreso = await addIncome(agent, periodo.id, 5000);
    assert.equal(ingreso.status, 201);
    await syncBudget(agent, periodo.id);

    const categorias = await listExpenseCategories(agent);
    await allocate(agent, periodo.id, categorias[0].id, 1000);

    const propuesta = await getRedistribution(agent, periodo.id);
    assert.equal(propuesta.redistribuible, false);
    assert.equal(propuesta.motivo, 'SIN_EXCEDENTE');
    assert.equal(Number(propuesta.totalPresupuesto), 5000);
    assert.equal(Number(propuesta.asignadoTotal), 1000);
  });

  it('sin asignaciones no hay redistribución (SIN_ASIGNACIONES)', async () => {
    const { agent, email } = await registerAndGetAgent();
    const periodo = await setupActivePeriod(agent, email);

    const ingreso = await addIncome(agent, periodo.id, 5000);
    assert.equal(ingreso.status, 201);
    await syncBudget(agent, periodo.id);

    const g1 = await addExpense(agent, periodo.id, 6000);
    assert.equal(g1.status, 201);

    const propuesta = await getRedistribution(agent, periodo.id);
    assert.equal(propuesta.redistribuible, false);
    assert.equal(propuesta.motivo, 'SIN_ASIGNACIONES');
    assert.equal(Number(propuesta.excedenteTotal), 1000);
  });

  it('sin holgura (asignaciones = total) no hay redistribución (SIN_HOLGURA)', async () => {
    const { agent, email } = await registerAndGetAgent();
    const periodo = await setupActivePeriod(agent, email);

    const ingreso = await addIncome(agent, periodo.id, 5000);
    assert.equal(ingreso.status, 201);
    await syncBudget(agent, periodo.id);

    const categorias = await listExpenseCategories(agent);
    await allocate(agent, periodo.id, categorias[0].id, 5000);

    const g1 = await addExpense(agent, periodo.id, 6000);
    assert.equal(g1.status, 201);

    const propuesta = await getRedistribution(agent, periodo.id);
    assert.equal(propuesta.redistribuible, false);
    assert.equal(propuesta.motivo, 'SIN_HOLGURA');
    assert.equal(Number(propuesta.excedenteTotal), 1000);
  });

  it('propone prorrateo proporcional del excedente entre asignaciones', async () => {
    const { agent, email } = await registerAndGetAgent();
    const periodo = await setupActivePeriod(agent, email);

    const ingreso = await addIncome(agent, periodo.id, 5000);
    assert.equal(ingreso.status, 201);
    await syncBudget(agent, periodo.id);

    const categorias = await listExpenseCategories(agent);
    const a1 = await allocate(agent, periodo.id, categorias[0].id, 2000);
    const a2 = await allocate(agent, periodo.id, categorias[1].id, 1000);

    const g1 = await addExpense(agent, periodo.id, 4000);
    const g2 = await addExpense(agent, periodo.id, 2000);
    assert.equal(g1.status, 201);
    assert.equal(g2.status, 201);

    const propuesta = await getRedistribution(agent, periodo.id);
    assert.equal(propuesta.redistribuible, true);
    assert.equal(propuesta.motivo, undefined);
    assert.equal(Number(propuesta.excedenteTotal), 1000);
    assert.equal(Number(propuesta.holgura), 2000);
    assert.equal(Number(propuesta.montoARedistribuir), 1000);

    assert.equal(propuesta.ajustes.length, 2);
    const ajuste1 = propuesta.ajustes.find((aj: any) => aj.id === a1.id);
    const ajuste2 = propuesta.ajustes.find((aj: any) => aj.id === a2.id);
    assert.ok(ajuste1);
    assert.ok(ajuste2);
    assert.equal(ajuste1.categoriaGastoId, categorias[0].id);
    assert.equal(ajuste1.categoriaNombre, categorias[0].name);
    assert.equal(Number(ajuste1.amountActual), 2000);
    assert.equal(Number(ajuste1.amountPropuesto), 2666.67);
    assert.equal(Number(ajuste1.delta), 666.67);
    assert.equal(Number(ajuste2.amountActual), 1000);
    assert.equal(Number(ajuste2.amountPropuesto), 1333.33);
    assert.equal(Number(ajuste2.delta), 333.33);
  });

  it('aplica la redistribución y actualiza las asignaciones', async () => {
    const { agent, email } = await registerAndGetAgent();
    const periodo = await setupActivePeriod(agent, email);

    const ingreso = await addIncome(agent, periodo.id, 5000);
    assert.equal(ingreso.status, 201);
    await syncBudget(agent, periodo.id);

    const categorias = await listExpenseCategories(agent);
    const a1 = await allocate(agent, periodo.id, categorias[0].id, 2000);
    await allocate(agent, periodo.id, categorias[1].id, 1000);

    const g1 = await addExpense(agent, periodo.id, 4000);
    const g2 = await addExpense(agent, periodo.id, 2000);
    assert.equal(g1.status, 201);
    assert.equal(g2.status, 201);

    const res = await agent.post(`/api/v1/periods/${periodo.id}/budget/redistribute`);
    assert.equal(res.status, 200);
    assert.equal(res.body.redistribution.redistribuible, true);
    assert.equal(res.body.redistribution.ajustes.length, 2);

    const budget = await agent.get(`/api/v1/periods/${periodo.id}/budget`);
    assert.equal(budget.status, 200);
    const asignaciones = budget.body.asignaciones;
    const a1Actualizado = asignaciones.find((a: any) => a.id === a1.id);
    assert.equal(Number(a1Actualizado.amount), 2666.67);
    assert.equal(Number(budget.body.asignadoTotal), 4000);
  });

  it('el excedente mayor que la holgura redistribuye solo hasta la holgura', async () => {
    const { agent, email } = await registerAndGetAgent();
    const periodo = await setupActivePeriod(agent, email);

    const ingreso = await addIncome(agent, periodo.id, 5000);
    assert.equal(ingreso.status, 201);
    await syncBudget(agent, periodo.id);

    const categorias = await listExpenseCategories(agent);
    const a1 = await allocate(agent, periodo.id, categorias[0].id, 1000);

    const g1 = await addExpense(agent, periodo.id, 8000);
    assert.equal(g1.status, 201);

    const propuesta = await getRedistribution(agent, periodo.id);
    assert.equal(propuesta.redistribuible, true);
    assert.equal(Number(propuesta.excedenteTotal), 3000);
    assert.equal(Number(propuesta.holgura), 4000);
    assert.equal(Number(propuesta.montoARedistribuir), 3000);
    assert.equal(propuesta.ajustes.length, 1);
    assert.equal(Number(propuesta.ajustes[0].amountActual), 1000);
    assert.equal(Number(propuesta.ajustes[0].amountPropuesto), 4000);
    assert.equal(Number(propuesta.ajustes[0].delta), 3000);
  });

  it('aplicar consume la holgura y la segunda aplicación responde 422', async () => {
    const { agent, email } = await registerAndGetAgent();
    const periodo = await setupActivePeriod(agent, email);

    const ingreso = await addIncome(agent, periodo.id, 5000);
    assert.equal(ingreso.status, 201);
    await syncBudget(agent, periodo.id);

    const categorias = await listExpenseCategories(agent);
    await allocate(agent, periodo.id, categorias[0].id, 4000);

    const g1 = await addExpense(agent, periodo.id, 4000);
    const g2 = await addExpense(agent, periodo.id, 2000);
    assert.equal(g1.status, 201);
    assert.equal(g2.status, 201);

    const primera = await agent.post(`/api/v1/periods/${periodo.id}/budget/redistribute`);
    assert.equal(primera.status, 200);
    assert.equal(Number(primera.body.redistribution.montoARedistribuir), 1000);
    assert.equal(Number(primera.body.redistribution.ajustes[0].amountPropuesto), 5000);

    const propuesta = await getRedistribution(agent, periodo.id);
    assert.equal(propuesta.redistribuible, false);
    assert.equal(propuesta.motivo, 'SIN_HOLGURA');

    const segunda = await agent.post(`/api/v1/periods/${periodo.id}/budget/redistribute`);
    assert.equal(segunda.status, 422);
    assert.equal(segunda.body.error.code, 'BUDGET_REDISTRIBUTION_NOT_AVAILABLE');
  });

  it('no permite redistribuir un período ajeno (403)', async () => {
    const { agent, email } = await registerAndGetAgent();
    const periodo = await setupActivePeriod(agent, email);

    const ingreso = await addIncome(agent, periodo.id, 5000);
    assert.equal(ingreso.status, 201);
    await syncBudget(agent, periodo.id);

    const categorias = await listExpenseCategories(agent);
    await allocate(agent, periodo.id, categorias[0].id, 1000);
    const g1 = await addExpense(agent, periodo.id, 6000);
    assert.equal(g1.status, 201);

    const otro = await registerAndGetAgent();
    const resProposal = await otro.agent.get(`/api/v1/periods/${periodo.id}/budget/redistribution`);
    assert.equal(resProposal.status, 403);
    const resApply = await otro.agent.post(`/api/v1/periods/${periodo.id}/budget/redistribute`);
    assert.equal(resApply.status, 403);
  });
});