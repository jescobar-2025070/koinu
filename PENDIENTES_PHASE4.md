# Fase 4 — Estado del proyecto y pendientes

Documento de seguimiento del trabajo en la rama `phase-4`.
Actualizado: 2026-09-09.

## 1. Estado general

- **Rama:** `phase-4` (local adelantada respecto a `origin/phase-4`).
- **Estructura:** `koinu/backend` (Node.js + Express + PostgreSQL) y `koinu/frontend` (Angular + TypeScript).
- **Núcleo del MVP implementado** (periodos, movimientos, ingresos, gastos, presupuesto, objetivos, informes, autenticación y administración).
- **Últimas verificaciones completas:**
  - Backend: typecheck OK, **137/137 tests** (29 suites).
  - Frontend: build OK, **80/80 tests** (11 archivos de specs).

## 2. Bloques completados (commitados)

| Bloque | Commit | Descripción |
|--------|--------|-------------|
| C1 | `349c0f1` | Snapshot del periodo anterior al crear uno nuevo. |
| C3 | `113996c` | Recálculo determinista de excedentes de presupuesto al cambiar movimientos. |
| C2+A3 | `f193b02` | Edición de ingresos con tratamientos fiscales reales y retenciones. |
| C4 | `dd7c1b2` | Sincronización del total del presupuesto vía endpoint POST explícito. |
| A1 | `3403c94` | Administración de usuarios con actualización de correo y reseteo de contraseña. |
| A5 | `a952daf` | Administración técnica de periodos con cancelación. |
| A2 | `8f11308` | Desviaciones por categoría y recomendaciones en reportes. |
| A6 | `42c9581` | Clasificación de movimientos y prioridad de objetivos. |
| A7 | `509eaa6` | Trazabilidad (auditoría) de movimientos y su UI en reportes. |
| M2 | `7e3ddbf` | Validación de duplicados de categorías (unique case-insensitive por usuario) y guard idempotente en `createDefaultsForUser`. |
| M3 | `0f7308a` | Origen del excedente: `getOverruns` y dashboard exponen el movimiento que generó cada excedente. |
| M4 | `e6536c9` | Vínculo movimientos↔objetivos: movimientos INCOME pueden marcarse con `objetivoId` y aportar automáticamente (por su neto) al `current_amount` del objetivo en la misma transacción (crear/editar/eliminar). |
| M5 | `81ba444` | Documentación de desviaciones (nomenclatura ES/EN, ACTIVE directo, presupuesto automático) en README y bitácora `ERRORES_Y_SOLUCIONES.md`. |
| M6 | `7116f4d` | Higiene: DTOs de respuesta estandarizados (dashboard y overruns envueltos en clave) e invariantes con `ErrorCodes`. |
| B1 | `4b6fdfa` | Documentación en README (sección API) de la nomenclatura de endpoints (español/camelCase, mapeo EN→ES) y de las respuestas envueltas en clave de recurso. |
| B2 | *(pendiente de commit)* | Notas documentales DRAFT sobre código inerte detectado en el sistema actual, en `NOTAS_CODIGO_INERTE.md` (rama DRAFT de períodos/M1, `RoleResponse` sin usar, endpoints y métodos frontend sin consumidor, scripts de mantenimiento). Bajo riesgo: documentación únicamente, sin cambios de funcionamiento. |

Flujo de verificación por bloque: `pnpm typecheck` + `pnpm test` (backend) y `pnpm build` + `pnpm ng test --watch=false` (frontend).

## 3. Decisiones y desviaciones acordadas

| Tema | Decisión |
|------|----------|
| A4 — Presupuesto total | El presupuesto total del periodo = ingresos netos. |
| M1 — Creación de periodo | Crear un periodo lo pone en estado `ACTIVO` de forma directa (sin paso intermedio). |
| A6 — Clasificación de movimientos | Gastos: `REGULAR`/`OCASIONAL` y `FIJO`/`VARIABLE`. Ingresos por esfuerzo: `ACTIVO`/`PASIVO`/`PORTAFOLIO`. Prioridad de objetivos: `ALTA`/`MEDIA`/`BAJA` (default `MEDIA`). |
| A7 — Auditoría de movimientos | Alcance acotado a movimientos (`CREADO`/`MODIFICADO`/`ELIMINADO`), consultable por periodo vía API y en la página de reportes, escrita en la misma transacción de cada operación. |
| M2 — Duplicados de categorías | Nombre de categoría único por usuario (case-insensitive); conflicto → `409 CATEGORY_ALREADY_EXISTS` (mismo patrón que `EMAIL_ALREADY_REGISTERED`/`BUDGET_ALREADY_EXISTS`); `createDefaultsForUser` idempotente (guarda `LOWER(existing.name) = LOWER(source.name)`). |
| M3 — Origen del excedente | `GET /periods/:id/budget/overruns` y el payload del dashboard incluyen, por cada excedente, el movimiento que lo generó (`movimiento.{id,date,amount,description,categoriaId,categoriaNombre}`) vía JOIN; en la UI se reemplaza la fecha del excedente por la del movimiento y se muestran CONCEPTO y CATEGORÍA (página Presupuesto y panel del dashboard). Además se normaliza `amount` de excedentes a número. |
| M5 — Documentación de desviaciones | Se documentaron en `README.md` (sección "Desviaciones y decisiones documentadas") tres desviaciones aprobadas: nomenclatura ES/EN, creación de períodos directo en `ACTIVE` (sin DRAFT) y presupuesto total automático = ingresos netos. Además se actualizó la bitácora **externa** `~/finanzas/ERRORES_Y_SOLUCIONES.md` (fuera del repo, no va en el commit). |
| M6 — Higiene (respuestas/DTOs/errores) | Convención: respuestas envueltas en clave nombrada de un recurso. Se estandarizó `GET /periods/:id/dashboard` → `{ dashboard }` y `GET /periods/:periodId/budget/overruns` → `{ overruns }`, actualizando los servicios frontend que las consumían; las invariantes de `detalle-ingreso` pasan de `throw new Error` (500) a `AppError(VALIDATION_ERROR, 400)`. El resto de errores ya usaba `ErrorCodes` (verificado en barrido). |
| M4 — Vínculo movimientos↔objetivos | Alcance decidido: aporte automático desde movimiento marcado. `movimientos.objetivo_id` (nullable, solo `INCOME` vía CHECK), `ON DELETE SET NULL`. Al crear/editar/eliminar un ingreso vinculado, `current_amount` del objetivo se ajusta en la misma transacción (crear: +neto; editar monto: delta; re-vincular: revierte el anterior y suma al nuevo; desvincular/eliminar: revierte el neto). Solo objetivos activos del propio usuario; objetivo inexistente → 404, ajeno → 403, no activo → 422 `GOAL_NOT_ACTIVE`. UI: select "Aporta a objetivo" en registro y edición de ingresos + columna OBJETIVO en el historial. |

> Nota: en `ANÁLISIS_DEL_SISTEMA.txt` la "auditoría avanzada" figura como *Fuera del MVP*; A7 se implementó por decisión del usuario con este alcance acotado.

## 4. Bloques pendientes

Los siguientes bloques quedaron acordados en sesión pero **aún no se implementan ni tienen aquí transcrito su detalle de requerimientos**; los specs se retomarán con el usuario al continuar:

| Bloque | Estado | Notas |
|--------|--------|-------|
| M4 | completado | Vínculo movimientos↔objetivos con aporte automático (ver §2 y §3). |
| B1 | completado | Nomenclatura de endpoints y respuestas documentada en README (sección API). |
| B2 | completado | Notas documentales DRAFT sobre código inerte detectado, en `NOTAS_CODIGO_INERTE.md` (ver §2 y §3). |
| B3 | pendiente | Requerimientos por transcribir al retomar. |
| B4 | pendiente | Requerimientos por transcribir al retomar. |
| B5 | pendiente | Requerimientos por transcribir al retomar. |

Alcance MVP aún cubierta parcialmente y candidata a asignarse a esos bloques (según `Planificación del Proyecto.pdf` / `ANÁLISIS_DEL_SISTEMA.txt`):

- Gestión de excedentes: origen de recursos, solicitud de redistribución presupuestaria, confirmación antes de redistribuir y actualización sugerida del presupuesto.
- Marcar objetivos como completados o cancelados.
- Finalización de periodo con generación de informe y sugerencia de crear/seleccionar un nuevo periodo.

## 5. Retomar el trabajo

1. Verificar estado actual: `git -C koinu status` y `git -C koinu log --oneline origin/phase-4..HEAD`.
2. Obtener del usuario el detalle del siguiente bloque (B*).
3. Implementar bloque por bloque, con verificación (typecheck/test/build) y commit por bloque, en inglés.
4. Actualizar este documento al cerrar cada bloque.
5. Push a `origin/phase-4` cuando el usuario lo indique.

## 6. Notas técnicas

- Test individual backend: `NODE_ENV=test pnpm tsx --test --test-concurrency=1 tests/<archivo>.test.ts`.
- Test individual frontend: `pnpm ng test --watch=false --include='**/<spec>.spec.ts'`.
- Suite backend completa: `pnpm test` (usa `tests/*.test.ts`, no pasar `tests/` directo).
- `rg` no está instalado en el entorno: usar `grep`.
- Advertencias de presupuesto CSS del build (`reports.css` 4.10 kB y `app.css` 6.03 kB vs 4 kB): solo *warning*, el build pasa; patrón preexistente en la rama.