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

async function setupActivePeriod(email: string, name: string) {
  const userId = await getUserId(email);
  const repo = new PeriodoRepository(pool);
  return repo.create({
    userId,
    name,
    startDate: new Date('2027-07-01'),
    endDate: new Date('2027-07-31'),
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
    date: '2027-07-02',
  });
}

async function addExpense(agent: request.Agent, periodId: string, amount: number) {
  const categorias = await agent.get('/api/v1/categories/expense');
  const categoriaId = categorias.body.categorias[0].id;
  const res = await agent.post('/api/v1/movements').send({
    periodId,
    type: 'EXPENSE',
    expenseCategoryId: categoriaId,
    amount,
    date: '2027-07-10',
  });
  assert.equal(res.status, 201);
  return categoriaId;
}

async function addObjective(
  agent: request.Agent,
  periodId: string,
  targetAmount: number,
  depositAmount?: number,
): Promise<string> {
  const created = await agent.post('/api/v1/objectives').send({
    periodoId: periodId,
    name: 'Computadora',
    targetAmount,
  });
  assert.equal(created.status, 201);
  const objetivoId = created.body.objetivo.id ?? created.body.id;
  if (depositAmount) {
    const deposit = await agent.post(`/api/v1/objectives/${objetivoId}/contributions`).send({
      amount: depositAmount,
    });
    assert.equal(deposit.status, 200);
  }
  return objetivoId;
}

describe('Informes: desviaciones por categoría y recomendaciones (A2)', () => {
  it('el informe preliminar incluye presupuestado por categoría y recomendaciones', async () => {
    const { agent, email } = await registerAndGetAgent();
    const periodo = await setupActivePeriod(email, 'Informes Jul ' + uniqueEmail().split('@')[0]);

    const ingreso = await addIncome(agent, periodo.id, 5000);
    assert.equal(ingreso.status, 201);

    const presupuesto = await agent.post(`/api/v1/periods/${periodo.id}/budget`);
    assert.equal(presupuesto.status, 200);
    assert.equal(Number(presupuesto.body.presupuesto.totalAmount), 5000);

    const categorias = await agent.get('/api/v1/categories/expense');
    const categoriaId = categorias.body.categorias[0].id;
    const alocacion = await agent
      .post(`/api/v1/periods/${periodo.id}/budget/allocations`)
      .send({ categoriaGastoId: categoriaId, amount: 2000 });
    assert.equal(alocacion.status, 201);

    await addExpense(agent, periodo.id, 1500);
    await addObjective(agent, periodo.id, 10000, 3000);

    const res = await agent.get(`/api/v1/periods/${periodo.id}/reports/preliminary`);
    assert.equal(res.status, 200);
    const report = res.body.report;

    assert.ok(Array.isArray(report.recomendaciones), 'debe incluir recomendaciones');
    assert.ok(
      report.recomendaciones.includes(
        'Considera apartar una parte de tu ingreso disponible para tus objetivos.',
      ),
      'debe recomendar apartar ingreso disponible para los objetivos',
    );
    assert.ok(
      report.recomendaciones.includes(
        'Te mantienes dentro de tu presupuesto general. Sigue registrando tus gastos para mantener el control.',
      ),
    );

    const filaGasto = report.porCategoria.find(
      (f: { categoriaId: string | null }) => f.categoriaId === categoriaId,
    );
    assert.ok(filaGasto, 'debe existir la fila de la categoría de gasto');
    assert.equal(Number(filaGasto.total), 1500);
    assert.equal(Number(filaGasto.presupuestado), 2000);
    assert.equal(filaGasto.tipo, 'EXPENSE');

    assert.equal(report.objetivos.length, 1);
    assert.equal(report.objetivos[0].progress, 30);
  });

  it('recomienda ajustar el presupuesto cuando los gastos generan excedente', async () => {
    const { agent, email } = await registerAndGetAgent();
    const periodo = await setupActivePeriod(email, 'Excedente Jul ' + uniqueEmail().split('@')[0]);

    const ingreso = await addIncome(agent, periodo.id, 5000);
    assert.equal(ingreso.status, 201);

    const presupuesto = await agent.post(`/api/v1/periods/${periodo.id}/budget`);
    assert.equal(presupuesto.status, 200);

    await addExpense(agent, periodo.id, 5700);

    const res = await agent.get(`/api/v1/periods/${periodo.id}/reports/preliminary`);
    assert.equal(res.status, 200);
    const report = res.body.report;

    assert.equal(Number(report.presupuesto.excedente), 700);
    assert.ok(
      report.recomendaciones.some((r: string) => r.includes('superaron tu presupuesto por Q700.00')),
      'debe recomendar ajustar el presupuesto indicando el excedente',
    );
  });

  it('el informe final conserva recomendaciones y desviaciones como copia histórica', async () => {
    const { agent, email } = await registerAndGetAgent();
    const periodo = await setupActivePeriod(email, 'Final Jul ' + uniqueEmail().split('@')[0]);

    await addIncome(agent, periodo.id, 4000);

    const presupuesto = await agent.post(`/api/v1/periods/${periodo.id}/budget`);
    assert.equal(presupuesto.status, 200);
    await addObjective(agent, periodo.id, 8000, 2000);

    const categorias = await agent.get('/api/v1/categories/expense');
    const categoriaId = categorias.body.categorias[0].id;
    const alocacion = await agent
      .post(`/api/v1/periods/${periodo.id}/budget/allocations`)
      .send({ categoriaGastoId: categoriaId, amount: 2000 });
    assert.equal(alocacion.status, 201);
    await addExpense(agent, periodo.id, 1000);

    const finalizado = await agent.post(`/api/v1/periods/${periodo.id}/finalize`);
    assert.equal(finalizado.status, 200);

    const res = await agent.get(`/api/v1/periods/${periodo.id}/reports/final`);
    assert.equal(res.status, 200);
    assert.ok(res.body.generadoEn, 'debe incluir la fecha de generación histórica');

    const report = res.body.report;
    assert.ok(Array.isArray(report.recomendaciones));
    assert.ok(
      report.recomendaciones.includes(
        'Considera apartar una parte de tu ingreso disponible para tus objetivos.',
      ),
    );
    assert.equal(report.objetivos.length, 1);
    assert.equal(report.objetivos[0].progress, 25);
    assert.ok(
      report.porCategoria.some(
        (f: { tipo: string; presupuestado: number | null }) => f.tipo === 'EXPENSE' && f.presupuestado !== null,
      ),
    );
    assert.equal(report.periodo.status, 'FINISHED');
  });
});