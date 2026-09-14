# Pruebas

El proyecto cubre tres niveles de prueba:

| Nivel | Tooling | Ubicación |
| --- | --- | --- |
| Backend | `node:test` + `supertest` + `tsx` | `backend/tests/` |
| Frontend | Vitest (integrado por Angular CLI) | `frontend/src/**/*.spec.ts` |
| End-to-end | Playwright | `e2e/tests/` |

> **Nota importante:** `backend/tests/`, `backend/scripts/e2e-prepare.ts` y `e2e/` son **assets locales** y están en `.gitignore` (`# Local-only assets: tests and E2E`). No se incluyen en el repositorio; si faltan en tu copia de trabajo, deberán regenerarse. Los comandos y la estructura descrita a continuación asumen que el workspace local los contiene.

## Backend

- **Framework:** `node:test` con `supertest` contra una base **`finanzas_test`**.
- **Configuración previa:**
  1. Crea la base: `CREATE DATABASE finanzas_test;`.
  2. Copia `backend/.env.test.example` a `backend/.env.test` y ajusta `DATABASE_URL` (usa un puerto distinto, p. ej. `3100`).
  3. Aplica las migraciones y el seed a la base de test con los scripts existentes.
- **Ejecución:**

  ```bash
  cd backend
  pnpm test
  ```

- **Organización actual (20 archivos):**
  - Autenticación: registro, login, refresh, logout, google, protección de endpoints.
  - Roles y administración: roles, CRUD de usuarios, períodos admin.
  - Períodos y etapas: creación/estados, dashboard.
  - Movimientos: edición, vínculo con objetivos, clasificaciones.
  - Presupuesto: presupuesto por categoría y sync.
  - Objetivos: aportes, retiros, estados.
  - Informes: preliminars, snapshots.
  - Auditoría de movimientos.
  - Utilidades comunes en `helpers.ts`.

## Frontend

- **Framework:** Vitest, configurado por Angular CLI (`@angular/build:unit-test`). Incluye `jsdom` para el DOM.
- **Ejecución:**

  ```bash
  cd frontend
  pnpm test
  ```

- **Organización actual (12 especificaciones):** `ApiService`, `AuthService`, guards (`auth`/`admin`) y páginas de presupuesto/objetivos, movimientos, períodos, administración e informes.

## End-to-end

- **Framework:** Playwright (Chromium).
- **Configuración previa:** instala el navegador la primera vez:
  ```bash
  cd e2e
  pnpm install
  pnpm test:install
  ```
- **Ejecución** (levanta automáticamente backend en `:3000` con `NODE_ENV=test` —ejecutando `e2e:prepare`— y frontend en `:4200`):

  ```bash
  cd e2e
  pnpm test
  ```

- **Cobertura actual:** `auth.spec.ts`, `budget.spec.ts`, `movements.spec.ts`, `objectives.spec.ts`, `periods.spec.ts`, `reports.spec.ts` (con helpers comunes).

## Buenas prácticas al añadir pruebas

- Mantener una base y `.env.test` separados del entorno de desarrollo.
- Probar las reglas de negocio clave: saldo disponible, remanente por categoría, límite de un período activo, snapshot único, rotación del refresh token.
- En el frontend, usar las interfaces de `core/models/api.models.ts` para tipar los mocks.
- Los tests end-to-end deben ser reproducibles contra datos sembrados (`e2e:prepare`).

## Verificación de tipos

Además de las suites, el backend incluye un chequeo de tipos:

```bash
cd backend
pnpm typecheck
```