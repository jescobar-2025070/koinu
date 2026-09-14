# Referencia de la API

Base URL: `http://localhost:3000/api/v1`

- Todas las rutas devuelven JSON.
- Las respuestas exitosas envuelven el recurso en la clave de su nombre: `{ usuario }`, `{ periodo }`, `{ movimiento }`, `{ presupuesto }`, `{ asignaciones }`, `{ dashboard }`, `{ report }`, `{ auditoria }`, `{ objetivos }`, etc.
- La autenticación usa el header `Cookie: finanzas_auth=<jwt>` (cookie `HttpOnly`) o el header `Authorization: Bearer <jwt>`.
- El frontend envía `withCredentials: true` (CORS con `credentials`).

## Formato estándar de error

```json
{
  "error": {
    "code": "VALIDATION_ERROR",
    "message": "Los datos proporcionados no son válidos.",
    "details": { "errors": { "email": "El correo electrónico es obligatorio." } }
  }
}
```

Códigos usados con frecuencia: `VALIDATION_ERROR` (400), `FORBIDDEN` (403), `NOT_FOUND` (404), `DATE_OUTSIDE_PERIOD` (422), `DATE_IN_FUTURE` (422), `INSUFFICIENT_FUNDS` (422), `EXPENSE_EXCEEDS_CATEGORY_ALLOCATION` (422), `AMOUNT_TOO_LARGE` (422), `GOAL_NOT_ACTIVE` (422), `PERIOD_NOT_FINALIZED` (409), `SESSION_IDLE_EXPIRED` (401), `CATEGORY_NOT_EDITABLE` (422), `CATEGORY_ALREADY_EXISTS` (409), `GOOGLE_AUTH_NOT_CONFIGURED` (503).

## Autenticación

| Método | Ruta | Auth | Descripción y cuerpo |
| --- | --- | --- | --- |
| `POST` | `/auth/register` | — | Registro público (rol `USR`). Cuerpo: `{ email, password }`. |
| `POST` | `/auth/login` | — | Inicia sesión y devuelve `Set-Cookie` con el JWT. Cuerpo: `{ email, password }`. |
| `POST` | `/auth/google` | — | Login/registro con Google (Auth0). Cuerpo: ID token de Google. Requiere credenciales Auth0. |
| `POST` | `/auth/refresh` | — | Rota el refresh token (revoca el anterior y emite uno nuevo). Cuerpo: `{ refreshToken }`. Rechaza sesiones expiradas o inactivas (`SESSION_IDLE_EXPIRED`). |
| `POST` | `/auth/logout` | Sí | Cierra sesión y revoca el refresh token. |
| `GET` | `/auth/me` | Sí | Devuelve la sesión actual (usuario, roles, `sessionIdleTimeoutMs`). Usado como latido de sesión. |
| `POST` | `/auth/forgot-password` | — | Genera un token de recuperación de un solo uso. Cuerpo: `{ email }`. En desarrollo devuelve el token en la respuesta. |
| `POST` | `/auth/reset-password` | — | Consume el token y fija la nueva contraseña. Cuerpo: `{ token, password }`. |

## Roles y usuarios (ADMIN)

| Método | Ruta | Auth | Descripción y cuerpo |
| --- | --- | --- | --- |
| `GET` | `/roles` | ADMIN | Lista los roles disponibles. |
| `GET` | `/users` | ADMIN | Lista todos los usuarios con roles y estado. |
| `POST` | `/users` | ADMIN | Crea un usuario. Cuerpo: `{ email, password, roles? }`. |
| `GET` | `/users/:id` | ADMIN | Obtiene un usuario. |
| `PATCH` | `/users/:id` | ADMIN | Actualiza el email. Cuerpo: `{ email }`. |
| `PATCH` | `/users/:id/active` | ADMIN | Activa/desactiva una cuenta. Cuerpo: `{ isActive }`. |
| `PUT` | `/users/:id/roles` | ADMIN | Asigna roles (mínimo uno). Cuerpo: `{ roles: ['ADMIN' \| 'USR'] }`. |
| `POST` | `/users/:id/reset-password` | ADMIN | Restablece la contraseña de un usuario. Cuerpo: `{ password }`. |
| `DELETE` | `/users/:id` | ADMIN | Elimina un usuario. |
| `GET` | `/system/health` | ADMIN | Estado de salud: API, base de datos, uptime y timestamp. |
| `GET` | `/admin/periods` | ADMIN | Lista global de períodos de todos los usuarios. |
| `POST` | `/admin/periods/:id/cancel` | ADMIN | Cancela un período. |

## Períodos

| Método | Ruta | Auth | Descripción y cuerpo |
| --- | --- | --- | --- |
| `GET` | `/periods` | Sí | Lista los períodos del usuario. |
| `GET` | `/periods/:id` | Sí | Obtiene un período por id. |
| `POST` | `/periods` | Sí | Crea un período **directamente en `ACTIVE`** (decisión M1). Cuerpo: `{ name, startDate, endDate }`. Si hay otro período activo, este se finaliza automáticamente. |
| `PUT` | `/periods/:id` | Sí | Modifica un período **solo si está en `DRAFT`**. |
| `POST` | `/periods/:id/activate` | Sí | Activa un período en `DRAFT` (reserva del modelo; prácticamente sin uso). |
| `POST` | `/periods/:id/finalize` | Sí | Finaliza el período `ACTIVE` (→ `FINISHED`) y genera el snapshot del informe final. |
| `POST` | `/periods/:id/cancel` | Sí | Cancela un período `DRAFT` o `ACTIVE` (→ `CANCELLED`). |
| `GET` | `/periods/:periodId/dashboard` | Sí | Datos del dashboard del período (totales, disponible, presupuesto, objetivos). |
| `GET` | `/periods/:periodId/audit` | Sí | Trazabilidad (creados/modificados/eliminados) de movimientos del período. |

Estados de período: `DRAFT`, `ACTIVE`, `FINISHED`, `CANCELLED`. Máximo un período `ACTIVE` por usuario. Solo se pueden registrar/editar/eliminar movimientos en períodos `ACTIVE`.

## Presupuesto

El presupuesto es **por período** y su **total se calcula automáticamente como los ingresos netos** (decisión A4); solo se definen asignaciones por categoría de gasto. El presupuesto se crea automáticamente al consultarlo.

| Método | Ruta | Auth | Descripción y cuerpo |
| --- | --- | --- | --- |
| `GET` | `/periods/:periodId/budget` | Sí | Presupuesto del período: total, asignaciones y disponibles. |
| `POST` | `/periods/:periodId/budget` | Sí | Sincroniza el total del presupuesto con los ingresos netos actuales. |
| `GET` | `/periods/:periodId/budget/allocations` | Sí | Lista las asignaciones por categoría. |
| `POST` | `/periods/:periodId/budget/allocations` | Sí | Crea una asignación. Cuerpo: `{ categoriaGastoId, amount }`. |
| `PATCH` | `/periods/budget-allocations/:id` | Sí | Actualiza el monto de una asignación. Cuerpo: `{ amount }`. |
| `DELETE` | `/periods/budget-allocations/:id` | Sí | Elimina una asignación. |

## Movimientos

| Método | Ruta | Auth | Descripción y cuerpo |
| --- | --- | --- | --- |
| `GET` | `/movements` | Sí | Lista movimientos del usuario (`?periodId=`). |
| `GET` | `/movements/stats` | Sí | Totales (`?periodId=`): `{ totalIngresos, totalGastos }`. |
| `POST` | `/movements` | Sí | Crea un movimiento (ver ejemplos abajo). |
| `PUT` | `/movements/:id` | Sí | Modifica un movimiento de un período `ACTIVE` (salvo aportes/retiros de objetivos). |
| `DELETE` | `/movements/:id` | Sí | Elimina un movimiento de un período `ACTIVE` (ajusta saldos y objetivos). |
| `GET` | `/movements/:id` | Sí | Obtiene un movimiento por id. |

### Crear un ingreso

```json
POST /api/v1/movements
{
  "periodId": "uuid-del-periodo",
  "type": "INCOME",
  "incomeCategoryId": "uuid-de-categoria",
  "incomeClassification": "REGULAR",
  "grossAmount": 2500.00,
  "retentionAmount": 125.00,
  "taxTreatmentId": "uuid-opcional",
  "objetivoId": "uuid-opcional",
  "description": "Pago por desarrollo de software",
  "date": "2026-08-25"
}
```

El backend calcula el **neto** (`gross − retention`) y lo guarda en `movimientos.amount`, almacenando bruto/retención/neto en `detalles_ingreso`. Validaciones: `incomeClassification` debe ser `REGULAR` u `OCASIONAL`; la retención no puede exceder el bruto.

### Crear un gasto

```json
POST /api/v1/movements
{
  "periodId": "uuid-del-periodo",
  "type": "EXPENSE",
  "expenseCategoryId": "uuid-de-categoria",
  "expenseType": "FIJO",
  "amount": 480.00,
  "description": "Licencia anual de hosting",
  "date": "2026-08-25"
}
```

Validaciones: `expenseType` debe ser `FIJO` o `VARIABLE`; el gasto no puede superar el **disponible del período** (`INSUFFICIENT_FUNDS`) ni el **remanente de la asignación** de su categoría cuando existe (`EXPENSE_EXCEEDS_CATEGORY_ALLOCATION`).

## Categorías

| Método | Ruta | Auth | Descripción y cuerpo |
| --- | --- | --- | --- |
| `GET` | `/categories/income` | Sí | Lista categorías de ingreso del usuario. |
| `POST` | `/categories/income` | Sí | Crea una categoría de ingreso. Cuerpo: `{ name }`. |
| `PATCH` | `/categories/income/:id` | Sí | Renombra una categoría propia (las `isDefault` devuelven `CATEGORY_NOT_EDITABLE`). Cuerpo: `{ name }`. |
| `DELETE` | `/categories/income/:id` | Sí | Elimina (baja lógica) una categoría propia. |
| `GET` | `/categories/expense` | Sí | Lista categorías de gasto del usuario. |
| `POST` | `/categories/expense` | Sí | Crea una categoría de gasto. Cuerpo: `{ name }`. |
| `PATCH` | `/categories/expense/:id` | Sí | Renombra una categoría propia. Cuerpo: `{ name }`. |
| `DELETE` | `/categories/expense/:id` | Sí | Elimina (baja lógica) una categoría propia. |
| `GET` | `/tax-treatments` | Sí | Lista los tratamientos fiscales activos (p. ej. "Sin retención", "Retención ISR 5%", "Retención ISR 7%"). |

Las categorías predeterminadas se asignan automáticamente a cada usuario al registrarse.

## Objetivos

| Método | Ruta | Auth | Descripción y cuerpo |
| --- | --- | --- | --- |
| `GET` | `/objectives` | Sí | Lista los objetivos del usuario. |
| `POST` | `/objectives` | Sí | Crea un objetivo. Cuerpo: `{ name, targetAmount, description?, deadline?, startDate?, priority?, periodoId? }`. |
| `GET` | `/objectives/period/:periodId` | Sí | Lista objetivos vinculados a un período. |
| `POST` | `/objectives/period/:periodId` | Sí | Crea un objetivo vinculado a un período. |
| `GET` | `/objectives/:id` | Sí | Obtiene un objetivo. |
| `PATCH` | `/objectives/:id` | Sí | Modifica un objetivo (`name`, `description`, `targetAmount`, `deadline`, `startDate`, `periodoId`, `priority`; no acepta `status`). |
| `DELETE` | `/objectives/:id` | Sí | Elimina un objetivo y sus movimientos internos. |
| `POST` | `/objectives/:id/contributions` | Sí | Deposita en el objetivo (solo `ACTIVE`). Cuerpo: `{ amount }`. Registra un movimiento de gasto interno. |
| `POST` | `/objectives/:id/withdrawals` | Sí | Retira del objetivo (solo `ACTIVE`, sin exceder `currentAmount`). Cuerpo: `{ amount }`. Registra un movimiento de ingreso interno. |
| `POST` | `/objectives/:id/complete` | Sí | Marca como `COMPLETED` (solo `ACTIVE`). |
| `POST` | `/objectives/:id/cancel` | Sí | Cancela el objetivo (solo `ACTIVE`). |

Estados de objetivo: `ACTIVE`, `COMPLETED`, `CANCELLED`. Prioridad: `ALTA`, `MEDIA` (por defecto), `BAJA`. Un aporte requiere un período `ACTIVE` (vinculado o el activo del usuario al momento del aporte).

## Informes

| Método | Ruta | Auth | Descripción |
| --- | --- | --- | --- |
| `GET` | `/periods/:periodId/reports/preliminary` | Sí | Informe en vivo: totales, presupuesto (total/asignado/disponible), desglose por categoría, objetivos y recomendaciones. |
| `GET` | `/periods/:periodId/reports/final` | Sí | Informe final: snapshot inmutable del período `FINISHED`. Devuelve `PERIOD_NOT_FINALIZED` (409) si el período no está finalizado y `NOT_FOUND` (404) si no existe snapshot. |

## Sistema (público)

| Método | Ruta | Auth | Descripción |
| --- | --- | --- | --- |
| `GET` | `/health` | — | Check de vida del servidor. Responde `{ "status": "ok" }`. |

## Ejemplos de flujo con `curl`

Login (guarda la cookie):

```bash
curl -c cookies.txt -X POST http://localhost:3000/api/v1/auth/login \
  -H 'Content-Type: application/json' \
  -d '{"email":"test@koinu.local","password":"Test1234"}'
```

Sesión actual:

```bash
curl -b cookies.txt http://localhost:3000/api/v1/auth/me
```

Crear un período:

```bash
curl -b cookies.txt -X POST http://localhost:3000/api/v1/periods \
  -H 'Content-Type: application/json' \
  -d '{"name":"Septiembre 2026","startDate":"2026-09-01","endDate":"2026-09-30"}'
```

Crear un gasto:

```bash
curl -b cookies.txt -X POST http://localhost:3000/api/v1/movements \
  -H 'Content-Type: application/json' \
  -d '{"periodId":"uuid","type":"EXPENSE","expenseCategoryId":"uuid","expenseType":"VARIABLE","amount":150.00}'
```