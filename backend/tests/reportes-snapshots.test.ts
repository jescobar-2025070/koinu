import { before, after, describe, it } from 'node:test';
import assert from 'node:assert/strict';
import request from 'supertest';
import { createApp } from '../src/app';
import { pool } from '../src/config/db';
import { setupTestDb, uniqueEmail } from './helpers';
import { PeriodoRepository } from '../src/repositories/periodo.repository';
import { SnapshotInformeRepository } from '../src/repositories/snapshot-informe.repository';

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

describe('Reportes y snapshots (C1)', () => {
  it('genera el snapshot del periodo anterior al crear uno nuevo', async () => {
    const { agent, email } = await registerAndGetAgent();
    const userId = await getUserId(email);
    const repo = new PeriodoRepository(pool);

    const p1 = await repo.create({
      userId,
      name: 'Enero 2027',
      startDate: new Date('2027-01-01'),
      endDate: new Date('2027-01-31'),
      status: 'ACTIVE',
    });

    const categorias = await agent.get('/api/v1/categories/income');
    const categoriaId = categorias.body.categorias[0].id;
    const ingreso = await agent.post('/api/v1/movements').send({
      periodId: p1.id,
      type: 'INCOME',
      incomeClassification: 'REGULAR',
      incomeCategoryId: categoriaId,
      grossAmount: 2000,
      retentionAmount: 100,
      date: '2027-01-15',
    });
    assert.equal(ingreso.status, 201);

    const res2 = await agent.post('/api/v1/periods').send({
      name: 'Febrero 2027',
      startDate: '2027-02-01',
      endDate: '2027-02-28',
    });
    assert.equal(res2.status, 201);
    assert.equal(res2.body.periodo.status, 'ACTIVE');

    const final = await agent.get(`/api/v1/periods/${p1.id}/reports/final`);
    assert.equal(final.status, 200);
    assert.equal(Number(final.body.report.totalIngresos), 1900);
    assert.equal(final.body.report.periodo.status, 'FINISHED');
  });

  it('finalizar un periodo genera su snapshot histórico', async () => {
    const { agent, email } = await registerAndGetAgent();
    const userId = await getUserId(email);
    const repo = new PeriodoRepository(pool);
    const p = await repo.create({
      userId,
      name: 'Finalizar con snapshot',
      startDate: new Date('2027-03-01'),
      endDate: new Date('2027-03-31'),
      status: 'ACTIVE',
    });

    const res = await agent.post(`/api/v1/periods/${p.id}/finalize`);
    assert.equal(res.status, 200);

    const snapshotRepo = new SnapshotInformeRepository(pool);
    const snapshot = await snapshotRepo.findByPeriodo(p.id);
    assert.ok(snapshot, 'Debe existir un snapshot para el periodo finalizado');
    assert.equal(res.body.periodo.status, 'FINISHED');
  });

  it('no permite dos snapshots para el mismo periodo (índice único)', async () => {
    const { agent, email } = await registerAndGetAgent();
    const userId = await getUserId(email);
    const repo = new PeriodoRepository(pool);
    const p = await repo.create({
      userId,
      name: 'Unico',
      startDate: new Date('2027-04-01'),
      endDate: new Date('2027-04-30'),
      status: 'ACTIVE',
    });
    await agent.post(`/api/v1/periods/${p.id}/finalize`);

    const snapshotRepo = new SnapshotInformeRepository(pool);
    await assert.rejects(
      () => snapshotRepo.create({ periodoId: p.id, reportData: { duplicado: true } }),
      /duplicate|uq_snapshots_informes_periodo/i,
    );
  });
});