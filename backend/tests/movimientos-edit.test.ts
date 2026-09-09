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
    name: 'Periodo Activo Test',
    startDate: new Date('2027-01-01'),
    endDate: new Date('2027-01-31'),
    status: 'ACTIVE',
  });
}

describe('Tratamientos fiscales (A3)', () => {
  it('lista tratamientos fiscales autenticado', async () => {
    const { agent } = await registerAndGetAgent();
    const res = await agent.get('/api/v1/tax-treatments');
    assert.equal(res.status, 200);
    assert.ok(res.body.tratamientos.length >= 3);
    const sinRetencion = res.body.tratamientos.find((t: any) => Number(t.rate) === 0);
    assert.ok(sinRetencion, 'Debe existir un tratamiento sin retención');
  });

  it('requiere autenticación para listar tratamientos', async () => {
    const res = await request(app).get('/api/v1/tax-treatments');
    assert.equal(res.status, 401);
  });
});

describe('Edición de movimientos (C2)', () => {
  it('al editar un ingreso mantiene neto = bruto - retención', async () => {
    const { agent, email } = await registerAndGetAgent();
    const periodo = await setupActivePeriod(agent, email);
    const categorias = await agent.get('/api/v1/categories/income');
    const categoriaId = categorias.body.categorias[0].id;

    const creado = await agent.post('/api/v1/movements').send({
      periodId: periodo.id,
      type: 'INCOME',
      incomeClassification: 'REGULAR',
      incomeCategoryId: categoriaId,
      grossAmount: 2000,
      retentionAmount: 100,
      date: '2027-01-15',
    });
    assert.equal(creado.status, 201);
    const movimientoId = creado.body.movimiento.id;

    const editado = await agent.put(`/api/v1/movements/${movimientoId}`).send({
      grossAmount: 2500,
      retentionAmount: 250,
      description: 'Corregido',
    });
    assert.equal(editado.status, 200);
    assert.equal(Number(editado.body.movimiento.amount), 2250);

    const consulta = await agent.get(`/api/v1/movements/${movimientoId}`);
    assert.equal(consulta.status, 200);
    assert.equal(Number(consulta.body.detalle.grossAmount), 2500);
    assert.equal(Number(consulta.body.detalle.retentionAmount), 250);
    assert.equal(Number(consulta.body.detalle.netAmount), 2250);
    assert.equal(consulta.body.movimiento.description, 'Corregido');
  });

  it('rechaza editar un ingreso con retención mayor al bruto', async () => {
    const { agent, email } = await registerAndGetAgent();
    const periodo = await setupActivePeriod(agent, email);
    const categorias = await agent.get('/api/v1/categories/income');
    const categoriaId = categorias.body.categorias[0].id;

    const creado = await agent.post('/api/v1/movements').send({
      periodId: periodo.id,
      type: 'INCOME',
      incomeClassification: 'REGULAR',
      incomeCategoryId: categoriaId,
      grossAmount: 1000,
      retentionAmount: 0,
      date: '2027-01-15',
    });
    const movimientoId = creado.body.movimiento.id;

    const res = await agent.put(`/api/v1/movements/${movimientoId}`).send({
      grossAmount: 1000,
      retentionAmount: 1500,
    });
    assert.equal(res.status, 400);
    assert.equal(res.body.error.code, 'VALIDATION_ERROR');
  });

  it('permite editar descripción y fecha sin alterar el neto', async () => {
    const { agent, email } = await registerAndGetAgent();
    const periodo = await setupActivePeriod(agent, email);
    const categorias = await agent.get('/api/v1/categories/income');
    const categoriaId = categorias.body.categorias[0].id;

    const creado = await agent.post('/api/v1/movements').send({
      periodId: periodo.id,
      type: 'INCOME',
      incomeClassification: 'REGULAR',
      incomeCategoryId: categoriaId,
      grossAmount: 3000,
      retentionAmount: 300,
      date: '2027-01-10',
    });
    const movimientoId = creado.body.movimiento.id;

    const editado = await agent.put(`/api/v1/movements/${movimientoId}`).send({
      description: 'Nueva descripción',
      date: '2027-01-20',
    });
    assert.equal(editado.status, 200);
    assert.equal(Number(editado.body.movimiento.amount), 2700);
    assert.equal(editado.body.movimiento.description, 'Nueva descripción');
  });
});