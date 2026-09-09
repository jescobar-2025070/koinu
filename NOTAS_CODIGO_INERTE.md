# Notas sobre código inerte — DRAFT

**Estado:** DRAFT (borrador) · **Riesgo:** bajo (solo documentación; no se modifica funcionamiento) · **Fecha:** 2026-09-09 · **Rama:** `phase-4`.

## 1. Propósito y método

- **Qué es:** catálogo del código que existe en el sistema pero no se ejecuta en el flujo normal de la aplicación (código inerte o "durmiente") y de piezas con funcionalidad parcialmente inaccesible.
- **Método:** análisis estático cruzando rutas del backend ↔ endpoints ↔ consumos del frontend (rutas Angular, páginas y servicios), contra las decisiones de diseño aprobadas (M1, A4, etc.).
- **Alcance:** SOLO documentación. Nada de esta lista se elimina ni se refactoriza aquí; las decisiones de limpieza quedan para bloques futuros si el usuario lo aprueba.
- **Convención de severidad:**
  - **Completamente inerte:** no es alcanzable en ningún flujo normal.
  - **Casi inerte:** alcanzable solo en circunstancias fuera del flujo habitual (datos legacy, llamadas directas a API, tests).

## 2. Código inerte encontrado

### 2.1 Rama `DRAFT` de períodos — casi inerte (origen: decisión M1)

M1 aprobó crear períodos **directamente en `ACTIVE`**. La rama `DRAFT → activate → ACTIVE` fue el flujo original de diseño y quedó sin uso real: no hay flujo normal que genere un período `DRAFT`.

| Pieza | Ubicación | Por qué es inerte |
| --- | --- | --- |
| `POST /periods/:id/activate` | `backend/src/routes/periodo.routes.ts:15` | Solo funciona sobre `DRAFT`; M1 no genera `DRAFT` en el flujo normal. |
| `PeriodoController.activate` | `backend/src/controllers/periodo.controller.ts:71` | Ídem. |
| `PeriodoService.activate` | `backend/src/services/periods/periodo.service.ts:117` | Ídem. |
| `PeriodoService.update` | `backend/src/services/periods/periodo.service.ts:94` | Rechaza todo período que no sea `DRAFT` (`400 "Solo se pueden modificar períodos en estado DRAFT."`); con M1 siempre se rechaza en flujo normal. |
| Default `status ?? 'DRAFT'` | `backend/src/repositories/periodo.repository.ts:104` | El repositorio puede crear `DRAFT`, pero el servicio siempre pasa `ACTIVE` explícito (solo tests/seeds usan el default). |
| `PeriodoService.activate()` (frontend) | `frontend/src/app/core/services/periodo.service.ts:30` | Sin consumidor real: su única llamada es la rama DRAFT de Overview. |
| `PeriodsOverview.activatePeriod` + `draftPeriods` | `frontend/src/app/features/periods/pages/overview/overview.ts:39,74` | Bloque de UI "activar borrador" (`overview.html:41-64`) que solo aparece si existe un `DRAFT` legacy. |
| `MODIFICAR PERÍODO ACTUAL` → `periods/edit` | `frontend/src/app/core/services/sidebar.service.ts:35`, `app.routes.ts:71-76` | La página `PeriodsEdit` (`edit.ts:45-65`) edita el período ACTIVE, pero el backend solo acepta `DRAFT` → el guardado siempre responde 400 en flujo normal. UI funcionalmente inerte. |
| Tests que ejercitan la rama | `backend/tests/etapa3.test.ts:93-143,263`, `admin.spec.ts:286-288`, `budget.spec.ts:178-184` | Cobertura que documenta la rama DRAFT como comportamiento histórico; no refleja el flujo actual. |

### 2.2 DTO y tipos sin usar — completamente inerte

| Pieza | Ubicación | Por qué es inerte |
| --- | --- | --- |
| `RoleResponse` | `backend/src/dto/responses/role.response.ts:3` | Definido y nunca importado; `RoleController.list` mapea `{ id, name }` inline (`role.controller.ts:16`). |

### 2.3 Endpoints y métodos frontend sin consumidor en la UI

| Pieza | Ubicación | Consumidor |
| --- | --- | --- |
| `GET/POST /objectives/period/:periodId` | `backend/src/routes/objetivo.routes.ts:16-17` | Sin consumidor en la UI. Solo `ObjetivoService.listByPeriod`/`createByPeriod` (`objetivo.service.ts:35,47`), que ninguna página llama (solo specs). |
| CRUD de categorías: `POST/PATCH/DELETE /categories/income` y `/categories/expense` | `backend/src/routes/categoria.routes.ts:12-19` | Solo `GET` se usa en la UI. `CategoriaService.createIncome/createExpense/updateIncome/updateExpense/deleteIncome/deleteExpense` (`categoria.service.ts:20-46`) no tienen llamadas en páginas. |
| `GET /periods/:id` | `backend/src/routes/periodo.routes.ts:12` | La app lista períodos y filtra en memoria (`periodoService.list()`); `PeriodoService.getById` (`periodo.service.ts:15`) no lo llama ninguna página (solo tests alcanzan el endpoint). |

### 2.4 Scripts y herramientas de mantenimiento

| Pieza | Ubicación | Observación |
| --- | --- | --- |
| `repair-missing-snapshots.ts` | `backend/scripts/repair-missing-snapshots.ts` | Utilidad de recuperación para períodos `FINISHED` sin snapshot. Ya no es necesaria en operación normal (los snapshots se generan en create/finalize), pero se conserva como herramienta de soporte. |
| `seed.ts` / `seed-full.ts` | `backend/scripts/` | Datos de desarrollo/pruebas; no forman parte de la aplicación. |

## 3. NO es código inerte (para evitar confusión)

- **Autenticación Google/Auth0** (`loginWithGoogle`, `POST /auth/google`, `auth0-client.service`): activa y operativa; es **condicional** (requiere las variables de entorno opcionales de `config/env.ts`).
- **Snapshots / informe final** (`snapshot-informe.*`, `generateAndSaveSnapshot`): se generan activamente al crear y finalizar períodos; el endpoint `report/final` los consume.
- **Excedentes/overruns** (`excedente-presupuesto.*`, `/budget/overruns`), **dashboard**, **auditoría de movimientos**: consumidos por la UI.
- **`GET /system/health`, `GET /health`**: consumidos (página admin y health check público).
- **Creación de períodos** (`POST /periods`): devuelve el período en `ACTIVE` (M1) — no es inerte, es el flujo actual.

## 4. Riesgo y manejo

- **Riesgo:** bajo — documento de carácter informativo; no cambia ninguna pieza de código ni comportamiento.
- **Gobernanza sugerida:** ninguna pieza de la sección 2 se elimina, desactiva ni refactoriza sin revisión previa y decisión explícita del usuario (bloques futuros, p. ej. B3+). Varios caminos "casi inertes" (Rama DRAFT) sirven de *fallback* y están cubiertos por tests.
- **Mantenimiento:** este documento es DRAFT y debe ampliarse/actualizarse si se detecta más código inerte o si alguna pieza cambia de estado (p. ej. si se elimina la rama DRAFT).

## 5. Referencias

- Decisión **M1** (creación de períodos directa en `ACTIVE`): `README.md`, sección "Desviaciones y decisiones documentadas".
- Seguimiento de bloques: `PENDIENTES_PHASE4.md`.