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
    name: 'Periodo Auditoría Test',
    startDate: new Date('2027-03-01'),
    endDate: new Date('2027-03-31'),
    status: 'ACTIVE',
  });
}

describe('Auditoría de movimientos (A7)', () => {
  it('registra CREADO al crear un ingreso y lo devuelve por período', async () => {
    const { agent, email } = await registerAndGetAgent();
    const periodo = await setupActivePeriod(agent, email);

    const categorias = await agent.get('/api/v1/categories/income');
    const categoriaId = categorias.body.categorias[0].id;

    const res = await agent.post('/api/v1/movements').send({
      periodId: periodo.id,
      type: 'INCOME',
      incomeClassification: 'REGULAR',
      incomeCategoryId: categoriaId,
      grossAmount: 2000,
      retentionAmount: 100,
      date: '2027-03-10',
    });
    assert.equal(res.status, 201);

    const audit = await agent.get(`/api/v1/periods/${periodo.id}/audit`);
    assert.equal(audit.status, 200);
    assert.equal(audit.body.auditoria.length, 1);
    const entry = audit.body.auditoria[0];
    assert.equal(entry.tipo, 'CREADO');
    assert.equal(entry.movimientoId, res.body.movimiento.id);
    assert.equal(entry.resumen.movimiento.type, 'INCOME');
    assert.equal(entry.resumen.movimiento.amount, 1900);
    assert.equal(entry.resumen.movimiento.incomeClassification, 'REGULAR');
  });

  it('registra MODIFICADO al editar un gasto con el detalle de cambios', async () => {
    const { agent, email } = await registerAndGetAgent();
    const periodo = await setupActivePeriod(agent, email);

    const categorias = await agent.get('/api/v1/categories/expense');
    const categoriaId = categorias.body.categorias[0].id;

    const creado = await agent.post('/api/v1/movements').send({
      periodId: periodo.id,
      type: 'EXPENSE',
      expenseType: 'VARIABLE',
      expenseCategoryId: categoriaId,
      amount: 500,
      date: '2027-03-10',
    });
    assert.equal(creado.status, 201);

    const editado = await agent.put(`/api/v1/movements/${creado.body.movimiento.id}`).send({
      amount: 800,
      description: 'Corregido',
    });
    assert.equal(editado.status, 200);

    const audit = await agent.get(`/api/v1/periods/${periodo.id}/audit`);
    assert.equal(audit.status, 200);
    assert.equal(audit.body.auditoria.length, 2);

    const modificado = audit.body.auditoria.find((e: any) => e.tipo === 'MODIFICADO');
    assert.ok(modificado, 'Debe existir un evento MODIFICADO');
    assert.equal(modificado.resumen.cambios.amount[0], 500);
    assert.equal(modificado.resumen.cambios.amount[1], 800);
    assert.equal(modificado.resumen.cambios.description[0], null);
    assert.equal(modificado.resumen.cambios.description[1], 'Corregido');
    assert.equal(modificado.resumen.antes.expenseType, 'VARIABLE');
  });

  it('registra ELIMINADO al eliminar un movimiento', async () => {
    const { agent, email } = await registerAndGetAgent();
    const periodo = await setupActivePeriod(agent, email);

    const categorias = await agent.get('/api/v1/categories/expense');
    const categoriaId = categorias.body.categorias[0].id;

    const creado = await agent.post('/api/v1/movements').send({
      periodId: periodo.id,
      type: 'EXPENSE',
      expenseType: 'FIJO',
      expenseCategoryId: categoriaId,
      amount: 300,
      date: '2027-03-15',
    });
    assert.equal(creado.status, 201);

    const del = await agent.delete(`/api/v1/movements/${creado.body.movimiento.id}`);
    assert.equal(del.status, 204);

    const audit = await agent.get(`/api/v1/periods/${periodo.id}/audit`);
    assert.equal(audit.status, 200);
    const eliminado = audit.body.auditoria.find((e: any) => e.tipo === 'ELIMINADO');
    assert.ok(eliminado, 'Debe existir un evento ELIMINADO');
    assert.equal(eliminado.resumen.movimiento.amount, 300);
    assert.equal(eliminado.resumen.movimiento.expenseType, 'FIJO');
  });

  it('ordena la auditoría por fecha descendente', async () => {
    const { agent, email } = await registerAndGetAgent();
    const periodo = await setupActivePeriod(agent, email);

    const categorias = await agent.get('/api/v1/categories/income');
    const categoriaId = categorias.body.categorias[0].id;

    const primero = await agent.post('/api/v1/movements').send({
      periodId: periodo.id,
      type: 'INCOME',
      incomeClassification: 'REGULAR',
      incomeCategoryId: categoriaId,
      grossAmount: 1000,
      retentionAmount: 0,
      date: '2027-03-05',
    });
    assert.equal(primero.status, 201);

    const segundo = await agent.post('/api/v1/movements').send({
      periodId: periodo.id,
      type: 'INCOME',
      incomeClassification: 'OCASIONAL',
      incomeCategoryId: categoriaId,
      grossAmount: 2000,
      retentionAmount: 0,
      date: '2027-03-20',
    });
    assert.equal(segundo.status, 201);

    const audit = await agent.get(`/api/v1/periods/${periodo.id}/audit`);
    assert.equal(audit.status, 200);
    assert.equal(audit.body.auditoria.length, 2);
    assert.equal(audit.body.auditoria[0].movimientoId, segundo.body.movimiento.id);
    assert.equal(audit.body.auditoria[1].movimientoId, primero.body.movimiento.id);
  });

  it('rechaza consultar la auditoría de un período ajeno', async () => {
    const { agent, email } = await registerAndGetAgent();
    const periodo = await setupActivePeriod(agent, email);
    const { agent: ajeno } = await registerAndGetAgent();

    const res = await ajeno.get(`/api/v1/periods/${periodo.id}/audit`);
    assert.equal(res.status, 403);
    assert.equal(res.body.error.code, 'FORBIDDEN');
  });

  it('requiere autenticación para consultar la auditoría', async () => {
    const res = await request(app).get(`/api/v1/periods/alguno/audit`);
    assert.equal(res.status, 401);
  });
});