import { before, after, describe, it } from 'node:test';
import assert from 'node:assert/strict';
import request from 'supertest';
import { createApp } from '../src/app';
import { pool } from '../src/config/db';
import { setupTestDb, uniqueEmail } from './helpers';
import { PeriodoRepository } from '../src/repositories/periodo.repository';
import { CategoriaIngresoRepository } from '../src/repositories/categoria-ingreso.repository';
import { CategoriaGastoRepository } from '../src/repositories/categoria-gasto.repository';

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

describe('Etapa 3 - Períodos y estados', () => {
  it('crea un período en estado ACTIVE y finaliza el anterior activo', async () => {
    const { agent } = await registerAndGetAgent();
    const res1 = await agent.post('/api/v1/periods').send({
      name: 'Enero 2027',
      startDate: '2027-01-01',
      endDate: '2027-01-31',
    });
    assert.equal(res1.status, 201);
    assert.equal(res1.body.periodo.status, 'ACTIVE');
    assert.equal(res1.body.periodo.name, 'Enero 2027');

    const res2 = await agent.post('/api/v1/periods').send({
      name: 'Febrero 2027',
      startDate: '2027-02-01',
      endDate: '2027-02-28',
    });
    assert.equal(res2.status, 201);
    assert.equal(res2.body.periodo.status, 'ACTIVE');

    const activos = await pool.query(
      "SELECT status FROM periodos WHERE user_id = $1 AND status = 'ACTIVE'",
      [res1.body.periodo.userId],
    );
    assert.equal(activos.rows.length, 1);

    const finalizado = await pool.query(
      'SELECT status FROM periodos WHERE id = $1',
      [res1.body.periodo.id],
    );
    assert.equal(finalizado.rows[0].status, 'FINISHED');
  });

  it('rechaza un período con fecha de inicio posterior a la de fin', async () => {
    const { agent } = await registerAndGetAgent();
    const res = await agent.post('/api/v1/periods').send({
      name: 'Inválido',
      startDate: '2027-02-01',
      endDate: '2027-01-31',
    });

    assert.equal(res.status, 422);
    assert.equal(res.body.error.code, 'VALIDATION_ERROR');
  });

  it('activa un período y no permite un segundo ACTIVE', async () => {
    const { agent, email } = await registerAndGetAgent();
    const userId = await getUserId(email);
    const repo = new PeriodoRepository(pool);

    const p1 = await repo.create({
      userId,
      name: 'Activo',
      startDate: new Date('2027-01-01'),
      endDate: new Date('2027-01-31'),
      status: 'DRAFT',
    });
    const p2 = await repo.create({
      userId,
      name: 'Segundo',
      startDate: new Date('2027-02-01'),
      endDate: new Date('2027-02-28'),
      status: 'DRAFT',
    });

    const activate1 = await agent.post(`/api/v1/periods/${p1.id}/activate`);
    assert.equal(activate1.status, 200);
    assert.equal(activate1.body.periodo.status, 'ACTIVE');

    const activate2 = await agent.post(`/api/v1/periods/${p2.id}/activate`);
    assert.equal(activate2.status, 409);
    assert.equal(activate2.body.error.code, 'VALIDATION_ERROR');
  });

  it('finaliza un período ACTIVE a FINISHED', async () => {
    const { agent, email } = await registerAndGetAgent();
    const userId = await getUserId(email);
    const repo = new PeriodoRepository(pool);

    const p = await repo.create({
      userId,
      name: 'Finalizar',
      startDate: new Date('2027-03-01'),
      endDate: new Date('2027-03-31'),
      status: 'ACTIVE',
    });

    const res = await agent.post(`/api/v1/periods/${p.id}/finalize`);
    assert.equal(res.status, 200);
    assert.equal(res.body.periodo.status, 'FINISHED');
  });

  it('no permite acceder al período de otro usuario', async () => {
    const { agent } = await registerAndGetAgent();
    const other = await registerAndGetAgent();
    const otherUserId = await getUserId(other.email);
    const repo = new PeriodoRepository(pool);
    const p = await repo.create({
      userId: otherUserId,
      name: 'Ajeno',
      startDate: new Date('2027-04-01'),
      endDate: new Date('2027-04-30'),
      status: 'DRAFT',
    });

    const res = await agent.post(`/api/v1/periods/${p.id}/activate`);
    assert.equal(res.status, 403);
  });
});

describe('Etapa 3 - Categorías por usuario', () => {
  it('siembra categorías predeterminadas al registrar un usuario', async () => {
    const { email } = await registerAndGetAgent();
    const userId = await getUserId(email);
    const repoIng = new CategoriaIngresoRepository(pool);
    const repoGas = new CategoriaGastoRepository(pool);

    const ingresos = await repoIng.findByUser(userId);
    const gastos = await repoGas.findByUser(userId);
    assert.ok(ingresos.length > 0, 'Debe haber categorías de ingreso predeterminadas');
    assert.ok(gastos.length > 0, 'Debe haber categorías de gasto predeterminadas');
  });

  it('lista categorías de ingreso y gasto por usuario autenticado', async () => {
    const { agent } = await registerAndGetAgent();

    const ing = await agent.get('/api/v1/categories/income');
    assert.equal(ing.status, 200);
    assert.ok(ing.body.categorias.length > 0);

    const gas = await agent.get('/api/v1/categories/expense');
    assert.equal(gas.status, 200);
    assert.ok(gas.body.categorias.length > 0);
  });
});

describe('Etapa 3 - Ingresos con tratamiento fiscal', () => {
  async function setupActivePeriod(agent: request.Agent, email: string) {
    const userId = await getUserId(email);
    const repo = new PeriodoRepository(pool);
    const p = await repo.create({
      userId,
      name: 'Periodo Activo Test',
      startDate: new Date('2027-01-01'),
      endDate: new Date('2027-01-31'),
      status: 'ACTIVE',
    });
    return p;
  }

  it('registra un ingreso y el backend calcula el neto', async () => {
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
      description: 'Pago de prueba',
      date: '2027-01-15',
    });

    assert.equal(res.status, 201);
    assert.equal(res.body.movimiento.type, 'INCOME');
    assert.equal(Number(res.body.movimiento.amount), 1900);
    assert.equal(Number(res.body.detalle.grossAmount), 2000);
    assert.equal(Number(res.body.detalle.retentionAmount), 100);
    assert.equal(Number(res.body.detalle.netAmount), 1900);
  });

  it('rechaza un ingreso con retención mayor al bruto', async () => {
    const { agent, email } = await registerAndGetAgent();
    const periodo = await setupActivePeriod(agent, email);
    const categorias = await agent.get('/api/v1/categories/income');
    const categoriaId = categorias.body.categorias[0].id;

    const res = await agent.post('/api/v1/movements').send({
      periodId: periodo.id,
      type: 'INCOME',
      incomeClassification: 'REGULAR',
      incomeCategoryId: categoriaId,
      grossAmount: 1000,
      retentionAmount: 1500,
      date: '2027-01-15',
    });

    assert.equal(res.status, 400);
    assert.equal(res.body.error.code, 'VALIDATION_ERROR');
  });

  it('rechaza un ingreso con fecha fuera del período', async () => {
    const { agent, email } = await registerAndGetAgent();
    const periodo = await setupActivePeriod(agent, email);
    const categorias = await agent.get('/api/v1/categories/income');
    const categoriaId = categorias.body.categorias[0].id;

    const res = await agent.post('/api/v1/movements').send({
      periodId: periodo.id,
      type: 'INCOME',
      incomeClassification: 'REGULAR',
      incomeCategoryId: categoriaId,
      grossAmount: 1000,
      retentionAmount: 0,
      date: '2027-03-01',
    });

    assert.equal(res.status, 422);
    assert.equal(res.body.error.code, 'DATE_OUTSIDE_PERIOD');
  });

  it('rechaza un movimiento en un período no ACTIVE', async () => {
    const { agent, email } = await registerAndGetAgent();
    const userId = await getUserId(email);
    const repo = new PeriodoRepository(pool);
    const p = await repo.create({
      userId,
      name: 'Borrador',
      startDate: new Date('2027-01-01'),
      endDate: new Date('2027-01-31'),
      status: 'DRAFT',
    });
    const categorias = await agent.get('/api/v1/categories/income');
    const categoriaId = categorias.body.categorias[0].id;

    const res = await agent.post('/api/v1/movements').send({
      periodId: p.id,
      type: 'INCOME',
      incomeClassification: 'REGULAR',
      incomeCategoryId: categoriaId,
      grossAmount: 1000,
      retentionAmount: 0,
      date: '2027-01-15',
    });

    assert.equal(res.status, 400);
  });
});

describe('Etapa 3 - Dashboard', () => {
  it('devuelve totales basados en ingreso neto y disponible', async () => {
    const { agent, email } = await registerAndGetAgent();
    const userId = await getUserId(email);
    const repo = new PeriodoRepository(pool);
    const p = await repo.create({
      userId,
      name: 'Dashboard Test',
      startDate: new Date('2027-01-01'),
      endDate: new Date('2027-01-31'),
      status: 'ACTIVE',
    });

    const categorias = await agent.get('/api/v1/categories/income');
    const categoriaId = categorias.body.categorias[0].id;

    await agent.post('/api/v1/movements').send({
      periodId: p.id,
      type: 'INCOME',
      incomeClassification: 'REGULAR',
      incomeCategoryId: categoriaId,
      grossAmount: 2000,
      retentionAmount: 100,
      date: '2027-01-10',
    });

    const res = await agent.get(`/api/v1/periods/${p.id}/dashboard`);
    assert.equal(res.status, 200);
    assert.equal(Number(res.body.totalIngresos), 1900);
    assert.equal(Number(res.body.totalGastos), 0);
    assert.equal(Number(res.body.disponible), 1900);
  });

  it('requiere autenticación para el dashboard', async () => {
    const res = await request(app).get('/api/v1/periods/some-id/dashboard');
    assert.equal(res.status, 401);
  });
});
