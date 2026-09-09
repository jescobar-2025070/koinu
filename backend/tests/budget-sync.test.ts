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
    name: 'Periodo Budget Sync Test',
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
    incomeCategoryId: categoriaId,
    grossAmount,
    retentionAmount: 0,
    date: '2027-06-05',
  });
}

async function countPresupuestos(periodoId: string): Promise<number> {
  const res = await pool.query<{ count: string }>(
    'SELECT COUNT(*) AS count FROM presupuestos WHERE periodo_id = $1',
    [periodoId],
  );
  return Number(res.rows[0].count);
}

async function getTotalPresupuesto(periodoId: string): Promise<number | null> {
  const res = await pool.query<{ total_amount: string | null }>(
    'SELECT total_amount FROM presupuestos WHERE periodo_id = $1',
    [periodoId],
  );
  return res.rows[0] ? Number(res.rows[0].total_amount) : null;
}

describe('Sincronización del presupuesto (C4)', () => {
  it('GET /budget es de solo lectura: no crea presupuesto si no existe', async () => {
    const { agent, email } = await registerAndGetAgent();
    const periodo = await setupActivePeriod(agent, email);

    const res = await agent.get(`/api/v1/periods/${periodo.id}/budget`);
    assert.equal(res.status, 200);
    assert.equal(res.body.presupuesto, null);
    assert.deepEqual(res.body.asignaciones, []);
    assert.equal(Number(res.body.asignadoTotal), 0);
    assert.equal(Number(res.body.excedenteTotal), 0);
    assert.equal(await countPresupuestos(periodo.id), 0);
  });

  it('POST /budget crea el presupuesto con total = ingresos netos', async () => {
    const { agent, email } = await registerAndGetAgent();
    const periodo = await setupActivePeriod(agent, email);

    const ingreso = await addIncome(agent, periodo.id, 5000);
    assert.equal(ingreso.status, 201);
    assert.equal(Number(ingreso.body.movimiento.amount), 5000);

    const res = await agent.post(`/api/v1/periods/${periodo.id}/budget`);
    assert.equal(res.status, 200);
    assert.ok(res.body.presupuesto?.id);
    assert.equal(Number(res.body.presupuesto.totalAmount), 5000);
    assert.equal(res.body.presupuesto.periodoId, periodo.id);

    assert.equal(await countPresupuestos(periodo.id), 1);
  });

  it('POST /budget es idempotente: no crea duplicados', async () => {
    const { agent, email } = await registerAndGetAgent();
    const periodo = await setupActivePeriod(agent, email);

    const first = await agent.post(`/api/v1/periods/${periodo.id}/budget`);
    assert.equal(first.status, 200);
    const firstId = first.body.presupuesto.id;

    const second = await agent.post(`/api/v1/periods/${periodo.id}/budget`);
    assert.equal(second.status, 200);
    assert.equal(second.body.presupuesto.id, firstId);

    assert.equal(await countPresupuestos(periodo.id), 1);
  });

  it('POST /budget actualiza el total cuando cambian los ingresos', async () => {
    const { agent, email } = await registerAndGetAgent();
    const periodo = await setupActivePeriod(agent, email);

    await agent.post(`/api/v1/periods/${periodo.id}/budget`);
    assert.equal(Number(await getTotalPresupuesto(periodo.id)), 0);

    const ingreso = await addIncome(agent, periodo.id, 8000);
    assert.equal(ingreso.status, 201);
    assert.equal(Number(ingreso.body.movimiento.amount), 8000);

    const res = await agent.post(`/api/v1/periods/${periodo.id}/budget`);
    assert.equal(Number(res.body.presupuesto.totalAmount), 8000);
    assert.equal(Number(await getTotalPresupuesto(periodo.id)), 8000);
    assert.equal(await countPresupuestos(periodo.id), 1);
  });

  it('no permite asignar sin haber definido el presupuesto', async () => {
    const { agent, email } = await registerAndGetAgent();
    const periodo = await setupActivePeriod(agent, email);

    const categorias = await agent.get('/api/v1/categories/expense');
    const categoriaId = categorias.body.categorias[0].id;

    const res = await agent
      .post(`/api/v1/periods/${periodo.id}/budget/allocations`)
      .send({ categoriaGastoId: categoriaId, amount: 100 });
    assert.equal(res.status, 404);
    assert.equal(res.body.error.code, 'BUDGET_NOT_FOUND');

    const ingreso = await addIncome(agent, periodo.id, 5000);
    assert.equal(ingreso.status, 201);

    const synced = await agent.post(`/api/v1/periods/${periodo.id}/budget`);
    assert.equal(synced.status, 200);

    const ok = await agent
      .post(`/api/v1/periods/${periodo.id}/budget/allocations`)
      .send({ categoriaGastoId: categoriaId, amount: 100 });
    assert.equal(ok.status, 201);
  });

  it('rechaza POST /budget de un período de otro usuario', async () => {
    const { email } = await registerAndGetAgent();
    const other = await registerAndGetAgent();
    const periodo = await setupActivePeriod(other.agent, email);

    const res = await other.agent.post(`/api/v1/periods/${periodo.id}/budget`);
    assert.equal(res.status, 403);
  });
});