# Base de datos

Sistema: **PostgreSQL**. El esquema se gestiona con **migraciones SQL versionadas** en `backend/migrations/` (25 archivos, numeración 001–025) aplicadas con `pnpm migrate`.

Todas las tablas usan `UUID` como clave primaria (`gen_random_uuid()`), `created_at`/`updated_at` como `TIMESTAMPTZ` con valores por defecto, y los identificadores de usuario se definen como `user_id` (dueño del recurso).

## Diagrama de entidades principales

```text
users 1─* periodos 1─* movimientos 1─0..1 detalles_ingreso
  │        │   └── 1─0..1 presupuestos 1─* asignaciones_presupuesto
  │        └──────── 1─0..1 snapshots_informes
  ├─* user_roles *─ roles
  ├─* refresh_tokens
  ├─* password_reset_tokens
  ├─* categorias_ingreso 1─* movimientos (income_category_id)
  ├─* categorias_gasto   1─* movimientos (expense_category_id)
  ├─* objetivos 1─0..* movimientos (objetivo_id)
  └─* movimiento_auditoria
                *─ tratamientos_fiscales (via detalles_ingreso)
```

## Tablas

### `users`

| Campo | Tipo | Notas |
| --- | --- | --- |
| `id` | UUID PK | |
| `email` | VARCHAR(255) UNIQUE | Normalizado |
| `password_hash` | VARCHAR(255) NULL | Nulo para usuarios de Google |
| `is_active` | BOOLEAN | Cuenta activa |
| `google_sub` | VARCHAR(255) UNIQUE | Identificador estable de la conexión de Google |
| `auth_provider` | VARCHAR(20) | `local` \| `google` |
| `deleted_at` | TIMESTAMPTZ | Baja lógica |

### `roles` y `user_roles`

- `roles`: `id`, `name` (`ADMIN`, `USR` — sembrados por migración), `created_at`.
- `user_roles`: `(user_id, role_id)` con `ON DELETE CASCADE`; clave primaria compuesta; índice por `role_id`. Relación muchos a muchos.

### `refresh_tokens`

| Campo | Tipo | Notas |
| --- | --- | --- |
| `id` | UUID PK | `sid` embebido en el JWT |
| `user_id` | UUID FK | `ON DELETE CASCADE` |
| `token_hash` | VARCHAR(255) UNIQUE | Refresh token almacenado con hash |
| `expires_at` | TIMESTAMPTZ | Duración máxima absoluta (`JWT_REFRESH_EXPIRES_IN`) |
| `last_used_at` | TIMESTAMPTZ | Última actividad de la sesión; controla el límite de inactividad |
| `revoked_at` | TIMESTAMPTZ | Revocación por rotación o logout |

Índices: `idx_refresh_tokens_user_id`, `idx_refresh_tokens_expires_at`.

### `password_reset_tokens`

Tokens de recuperación de contraseña de un solo uso, con hash: `user_id` (FK, cascade), `token_hash` (UNIQUE), `expires_at`, `used_at`, `created_at`. Índice por `user_id`.

### `periodos`

| Campo | Tipo | Notas |
| --- | --- | --- |
| `id` | UUID PK | |
| `user_id` | UUID FK | `ON DELETE CASCADE` |
| `name` | VARCHAR(100) | |
| `start_date` / `end_date` | DATE | `CHECK (start_date <= end_date)` |
| `status` | VARCHAR(20) | `DRAFT` \| `ACTIVE` \| `FINISHED` \| `CANCELLED` |
| `deleted_at` | TIMESTAMPTZ | |

Índices: `idx_periodos_user_id` y el índice único parcial **`uq_periodos_one_active`** sobre `user_id` para `status = 'ACTIVE'` (garantiza un solo período activo por usuario).

### `categorias_ingreso` / `categorias_gasto`

| Campo | Tipo | Notas |
| --- | --- | --- |
| `id` | UUID PK | |
| `user_id` | UUID NULL | `NULL` = categoría predeterminada global |
| `name` | VARCHAR(100) | |
| `is_default` | BOOLEAN | Las predeterminadas no son editables |
| `is_active` | BOOLEAN | Baja lógica |

Predeterminadas sembradas por migración:
- Ingreso: `Salario`, `Freelance`, `Inversiones`, `Otros Ingresos`.
- Gasto: `Alimentación`, `Transporte`, `Educación`, `Servicios`, `Otros Gastos`.

Índices por `user_id`. Al registrar un usuario se clonan las predeterminadas para ese usuario (`createDefaultsForUser`).

### `tratamientos_fiscales`

| Campo | Tipo | Notas |
| --- | --- | --- |
| `id` | UUID PK | |
| `name` | VARCHAR(100) | |
| `rate` | DECIMAL(5,4) | 0..1 |
| `is_active` | BOOLEAN | |

Sembrados: `Sin retención` (0), `Retención ISR 5%` (0.05), `Retención ISR 7%` (0.07).

### `movimientos`

| Campo | Tipo | Notas |
| --- | --- | --- |
| `id` | UUID PK | |
| `user_id` | UUID FK | |
| `periodo_id` | UUID FK | `ON DELETE CASCADE` |
| `type` | VARCHAR(20) | `INCOME` \| `EXPENSE` |
| `income_category_id` | UUID NULL | FK a categorías de ingreso (`ON DELETE RESTRICT`) |
| `expense_category_id` | UUID NULL | FK a categorías de gasto (`ON DELETE RESTRICT`) |
| `objetivo_id` | UUID NULL | Movimiento interno de objetivo (constraint 025) |
| `amount` | DECIMAL(14,2) | Neto (ingresos) o total (gastos); `> 0` |
| `income_classification` | VARCHAR(20) NULL | `REGULAR` \| `OCASIONAL` (solo ingresos) |
| `expense_type` | VARCHAR(20) NULL | `FIJO` \| `VARIABLE` (solo gastos) |
| `description` | TEXT | |
| `date` | DATE | |
| `deleted_at` | TIMESTAMPTZ | |

Constraint `chk_movimiento_categoria`: un ingreso requiere categoría de ingreso y un gasto categoría de gasto, **excepto** los movimientos internos de objetivo (aportes/retiros), que no llevan categoría. Constraint `chk_mov_objetivo_income`: los objetivos solo admiten `INCOME` salvo aportes internos sin categoría.

Índices: `(user_id, periodo_id)`, `date`, `type`, `objetivo_id`.

### `detalles_ingreso`

Detalle fiscal del ingreso (`movement_id` PK — FK `ON DELETE CASCADE`):
- `tax_treatment_id` — FK a `tratamientos_fiscales`.
- `gross_amount` DECIMAL(14,2) `> 0`.
- `retention_amount` DECIMAL(14,2) `>= 0`, con `CHECK (retention_amount <= gross_amount)`.
- `net_amount` DECIMAL(14,2) con `CHECK (net_amount = gross_amount - retention_amount)`.

### `objetivos`

| Campo | Tipo | Notas |
| --- | --- | --- |
| `id` | UUID PK | |
| `user_id` | UUID FK | |
| `periodo_id` | UUID NULL | Vinculación opcional a un período (`ON DELETE SET NULL`) |
| `name` | VARCHAR(100) | |
| `description` | TEXT NULL | |
| `target_amount` | DECIMAL(14,2) | `> 0` |
| `current_amount` | DECIMAL(14,2) | `>= 0` |
| `deadline` / `start_date` | DATE NULL | |
| `status` | VARCHAR(20) | `ACTIVE` \| `COMPLETED` \| `CANCELLED` |
| `priority` | VARCHAR(20) | `ALTA` \| `MEDIA` (default) \| `BAJA` |

Índices: `user_id`, `periodo_id`.

### `presupuestos`

| Campo | Tipo | Notas |
| --- | --- | --- |
| `id` | UUID PK | |
| `periodo_id` | UUID UNIQUE FK | Un presupuesto por período |
| `total_amount` | DECIMAL(14,2) | `>= 0`; sincronizado con los ingresos netos del período |

Índice por `periodo_id`.

### `asignaciones_presupuesto`

| Campo | Tipo | Notas |
| --- | --- | --- |
| `id` | UUID PK | |
| `presupuesto_id` | UUID FK | `ON DELETE CASCADE` |
| `categoria_gasto_id` | UUID FK | `ON DELETE RESTRICT` |
| `amount` | DECIMAL(14,2) | `> 0` |

Unique `(presupuesto_id, categoria_gasto_id)` (una asignación por categoría y presupuesto). Índice por `presupuesto_id`.

### `snapshots_informes`

| Campo | Tipo | Notas |
| --- | --- | --- |
| `id` | UUID PK | |
| `periodo_id` | UUID FK | |
| `report_data` | JSONB | Datos del informe final |
| `generated_at` | TIMESTAMPTZ | |

Índice único `uq_snapshots_informes_periodo` (`periodo_id`): **un solo snapshot por período**, generado al finalizar.

### `movimiento_auditoria`

| Campo | Tipo | Notas |
| --- | --- | --- |
| `id` | UUID PK | |
| `movimiento_id` | UUID | (sin FK para conservar el registro aunque el movimiento se elimine) |
| `periodo_id` | UUID FK | `ON DELETE CASCADE` |
| `user_id` | UUID FK | |
| `tipo` | VARCHAR(20) | `CREADO` \| `MODIFICADO` \| `ELIMINADO` |
| `resumen` | JSONB | Estado anterior/después y cambios |
| `created_at` | TIMESTAMPTZ | |

Índices: `(periodo_id, created_at DESC)`, `movimiento_id`.

## Notas de integralidad

- **Los montos se validan en transacción**: los gastos controlan el disponible del período y el remanente de su asignación dentro de `withTransaction`; las operaciones sobre objetivos ajustan `presupuestos`, `movimientos` y `objetivos` atómicamente.
- **El presupuesto total se sincroniza** con la suma de ingresos netos del período (`syncBudget` en `POST /periods/:periodId/budget`).
- **Bajas lógicas**: `users.deleted_at`, categorías `is_active = false`. Los movimientos nunca se "borran" por restricciones de integridad fiscal (auditoría y snapshot).
- **La tabla `excedentes_presupuesto` fue eliminada** en la migración 024 (funcionalidad de excedentes fuera del alcance de este release).