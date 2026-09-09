import { before, after, describe, it } from 'node:test';
import assert from 'node:assert/strict';
import request from 'supertest';
import { createApp } from '../src/app';
import { pool } from '../src/config/db';
import { setupTestDb, uniqueEmail } from './helpers';
import { CategoriaService } from '../src/services/categories/categoria.service';

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
  return { agent, email };
}

async function getUserId(email: string): Promise<string> {
  const res = await pool.query<{ id: string }>('SELECT id FROM users WHERE email = $1', [email]);
  return res.rows[0].id;
}

function countExpenseCategories(userId: string): Promise<number> {
  return pool
    .query<{ count: string }>('SELECT COUNT(*) AS count FROM categorias_gasto WHERE user_id = $1', [userId])
    .then((res) => Number(res.rows[0].count));
}

describe('Categorías — duplicados e idempotencia (M2)', () => {
  it('rechaza crear una categoría duplicada exacta', async () => {
    const { agent } = await registerAndGetAgent();

    const first = await agent.post('/api/v1/categories/income').send({ name: 'Hobby' });
    assert.equal(first.status, 201);

    const second = await agent.post('/api/v1/categories/income').send({ name: 'Hobby' });
    assert.equal(second.status, 409);
    assert.equal(second.body.error.code, 'CATEGORY_ALREADY_EXISTS');
  });

  it('rechaza un duplicado ignorando mayúsculas/minúsculas', async () => {
    const { agent } = await registerAndGetAgent();

    const first = await agent.post('/api/v1/categories/expense').send({ name: 'Libros' });
    assert.equal(first.status, 201);

    const second = await agent.post('/api/v1/categories/expense').send({ name: 'lIBROs' });
    assert.equal(second.status, 409);
    assert.equal(second.body.error.code, 'CATEGORY_ALREADY_EXISTS');
  });

  it('rechaza un duplicado contra las categorías predeterminadas copiadas al usuario', async () => {
    const { agent } = await registerAndGetAgent();

    const res = await agent.post('/api/v1/categories/income').send({ name: 'SALARIO' });
    assert.equal(res.status, 409);
    assert.equal(res.body.error.code, 'CATEGORY_ALREADY_EXISTS');
  });

  it('permite a otro usuario crear la misma categoría (aislamiento por usuario)', async () => {
    const primero = await registerAndGetAgent();
    const segundo = await registerAndGetAgent();

    const creada = await primero.agent.post('/api/v1/categories/income').send({ name: 'Hobby' });
    assert.equal(creada.status, 201);

    const propia = await segundo.agent.post('/api/v1/categories/income').send({ name: 'Hobby' });
    assert.equal(propia.status, 201);
  });

  it('permite renombrar una categoría a su mismo nombre sin conflicto', async () => {
    const { agent } = await registerAndGetAgent();

    const creada = await agent.post('/api/v1/categories/expense').send({ name: 'Renta' });
    assert.equal(creada.status, 201);

    const renombrada = await agent
      .patch(`/api/v1/categories/expense/${creada.body.categoria.id}`)
      .send({ name: 'renta' });
    assert.equal(renombrada.status, 200);
    assert.equal(renombrada.body.categoria.name, 'renta');
  });

  it('rechaza renombrar a un nombre ya usado por otra categoría', async () => {
    const { agent } = await registerAndGetAgent();

    const viajes = await agent.post('/api/v1/categories/income').send({ name: 'Viajes' });
    const comidas = await agent.post('/api/v1/categories/income').send({ name: 'Comidas' });
    assert.equal(viajes.status, 201);
    assert.equal(comidas.status, 201);

    const conflicto = await agent
      .patch(`/api/v1/categories/income/${comidas.body.categoria.id}`)
      .send({ name: 'viajes' });
    assert.equal(conflicto.status, 409);
    assert.equal(conflicto.body.error.code, 'CATEGORY_ALREADY_EXISTS');
  });

  it('permite recrear una categoría eliminada (soft delete) con el mismo nombre', async () => {
    const { agent } = await registerAndGetAgent();

    const creada = await agent.post('/api/v1/categories/expense').send({ name: 'Extras' });
    assert.equal(creada.status, 201);

    const eliminada = await agent.delete(`/api/v1/categories/expense/${creada.body.categoria.id}`);
    assert.equal(eliminada.status, 204);

    const recreada = await agent.post('/api/v1/categories/expense').send({ name: 'extras' });
    assert.equal(recreada.status, 201);
  });

  it('createDefaultsForUser es idempotente al ejecutarse varias veces', async () => {
    const { email } = await registerAndGetAgent();
    const userId = await getUserId(email);

    const service = new CategoriaService();
    const antesIngreso = (await service.listIngreso(userId)).length;
    const antesGasto = (await service.listGasto(userId)).length;

    await service.createDefaultsForUser(userId);
    await service.createDefaultsForUser(userId);

    assert.equal((await service.listIngreso(userId)).length, antesIngreso);
    assert.equal((await service.listGasto(userId)).length, antesGasto);
  });

  it('createDefaultsForUser no duplica si existe una variante con distinta caja', async () => {
    const { email } = await registerAndGetAgent();
    const userId = await getUserId(email);

    await pool.query(
      `INSERT INTO categorias_gasto (user_id, name, is_default) VALUES ($1, 'ALIMENTACIÓN', FALSE)`,
      [userId],
    );

    const antes = await countExpenseCategories(userId);

    const service = new CategoriaService();
    await service.createDefaultsForUser(userId);

    assert.equal(await countExpenseCategories(userId), antes);

    const variantes = await pool.query<{ count: string }>(
      `SELECT COUNT(*) AS count FROM categorias_gasto
        WHERE user_id = $1 AND LOWER(name) = 'alimentación'`,
      [userId],
    );
    assert.equal(Number(variantes.rows[0].count), 2);
  });
});