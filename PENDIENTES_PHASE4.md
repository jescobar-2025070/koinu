# Fase 4 — Estado del proyecto y pendientes

Documento de seguimiento del trabajo en la rama `phase-4`.
Actualizado: 2026-09-08.

## 1. Estado general

- **Rama:** `phase-4` (local adelantada respecto a `origin/phase-4`).
- **Estructura:** `koinu/backend` (Node.js + Express + PostgreSQL) y `koinu/frontend` (Angular + TypeScript).
- **Núcleo del MVP implementado** (periodos, movimientos, ingresos, gastos, presupuesto, objetivos, informes, autenticación y administración).
- **Últimas verificaciones completas:**
  - Backend: typecheck OK, **114/114 tests** (26 suites).
  - Frontend: build OK, **77/77 tests** (10 archivos de specs).

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

Flujo de verificación por bloque: `pnpm typecheck` + `pnpm test` (backend) y `pnpm build` + `pnpm ng test --watch=false` (frontend).

## 3. Decisiones y desviaciones acordadas

| Tema | Decisión |
|------|----------|
| A4 — Presupuesto total | El presupuesto total del periodo = ingresos netos. |
| M1 — Creación de periodo | Crear un periodo lo pone en estado `ACTIVO` de forma directa (sin paso intermedio). |
| A6 — Clasificación de movimientos | Gastos: `REGULAR`/`OCASIONAL` y `FIJO`/`VARIABLE`. Ingresos por esfuerzo: `ACTIVO`/`PASIVO`/`PORTAFOLIO`. Prioridad de objetivos: `ALTA`/`MEDIA`/`BAJA` (default `MEDIA`). |
| A7 — Auditoría de movimientos | Alcance acotado a movimientos (`CREADO`/`MODIFICADO`/`ELIMINADO`), consultable por periodo vía API y en la página de reportes, escrita en la misma transacción de cada operación. |

> Nota: en `ANÁLISIS_DEL_SISTEMA.txt` la "auditoría avanzada" figura como *Fuera del MVP*; A7 se implementó por decisión del usuario con este alcance acotado.

## 4. Bloques pendientes

Los siguientes bloques quedaron acordados en sesión pero **aún no se implementan ni tienen aquí transcrito su detalle de requerimientos**; los specs se retomarán con el usuario al continuar:

| Bloque | Estado | Notas |
|--------|--------|-------|
| M2 | pendiente | Requerimientos por transcribir al retomar. |
| M3 | pendiente | Requerimientos por transcribir al retomar. |
| M5 | pendiente | Requerimientos por transcribir al retomar. |
| M6 | pendiente | Requerimientos por transcribir al retomar. |
| B1 | pendiente | Requerimientos por transcribir al retomar. |
| B2 | pendiente | Requerimientos por transcribir al retomar. |
| B3 | pendiente | Requerimientos por transcribir al retomar. |
| B4 | pendiente | Requerimientos por transcribir al retomar. |
| B5 | pendiente | Requerimientos por transcribir al retomar. |

Alcance MVP aún cubierta parcialmente y candidata a asignarse a esos bloques (según `Planificación del Proyecto.pdf` / `ANÁLISIS_DEL_SISTEMA.txt`):

- Gestión de excedentes: origen de recursos, solicitud de redistribución presupuestaria, confirmación antes de redistribuir y actualización sugerida del presupuesto.
- Relación movimientos ↔ objetivos y registro de avance de progreso.
- Marcar objetivos como completados o cancelados.
- Finalización de periodo con generación de informe y sugerencia de crear/seleccionar un nuevo periodo.

## 5. Retomar el trabajo

1. Verificar estado actual: `git -C koinu status` y `git -C koinu log --oneline origin/phase-4..HEAD`.
2. Obtener del usuario el detalle del siguiente bloque (M2, M3, M5, M6 o B*).
3. Implementar bloque por bloque, con verificación (typecheck/test/build) y commit por bloque, en inglés.
4. Actualizar este documento al cerrar cada bloque.
5. Push a `origin/phase-4` cuando el usuario lo indique.

## 6. Notas técnicas

- Test individual backend: `NODE_ENV=test pnpm tsx --test --test-concurrency=1 tests/<archivo>.test.ts`.
- Test individual frontend: `pnpm ng test --watch=false --include='**/<spec>.spec.ts'`.
- Suite backend completa: `pnpm test` (usa `tests/*.test.ts`, no pasar `tests/` directo).
- `rg` no está instalado en el entorno: usar `grep`.
- Advertencias de presupuesto CSS del build (`reports.css` 4.10 kB y `app.css` 6.03 kB vs 4 kB): solo *warning*, el build pasa; patrón preexistente en la rama.