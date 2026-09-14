# Arquitectura

## Visión general

Koinu Finance es una aplicación de dos capas: una **SPA Angular** que consume una **API REST** (Express + TypeScript) construida sobre **PostgreSQL**.

```text
┌────────────────────┐
│      Angular       │  SPA (http://localhost:4200)
│   frontend/src/    │
└─────────┬──────────┘
          │  HTTP/REST (JSON)
          │  cookie HttpOnly + Authorization header opcional
          ▼
┌────────────────────┐
│   Node.js + Expr.  │  API REST (http://localhost:3000/api/v1)
│  backend/src/      │
└─────────┬──────────┘
          ▼
┌────────────────────┐
│    PostgreSQL      │  migraciones versionadas (001-025)
└────────────────────┘
```

## Backend

### Capas

```text
Route → Validator → Controller → Service → Repository → PostgreSQL
   │
   └──── Middleware: authenticate → authorize (requireRole) → validate → error-handler
```

- **Routes** (`backend/src/routes/`): definen la superficie HTTP y encadenan middleware de autenticación, autorización y validación. Se montan bajo el prefijo `/api/v1` en `app.ts`.
- **Validators** (`backend/src/validators/`): validan el cuerpo de la petición antes de llegar al controller (el backend es la autoridad de validación).
- **Controllers** (`backend/src/controllers/`): adaptan la petición HTTP a los servicios y formatean la respuesta.
- **Services** (`backend/src/services/`): contienen la lógica de negocio y las invariantes (saldos, transiciones de estado, auditoría).
- **Repositories** (`backend/src/repositories/`): capa exclusiva de persistencia con `pg`.
- **Mappers/DTOs** (`backend/src/dto/`): conversión entidad → contrato de salida.

### Middleware

| Middleware | Función |
| --- | --- |
| `authenticate` | Verifica el JWT (cookie `HttpOnly` o header `Authorization: Bearer`), carga el usuario de base de datos y adjunta `req.user`. |
| `authorize` (`requireRole`) | Restringe endpoints por rol (`ADMIN`). |
| `validate` | Valida el cuerpo de la petición contra un validador. |
| `error-handler` | Formatea todos los errores al estándar de la API; nunca expone stack traces. |

### Manejo transaccional

Las operaciones que actualizan varias tablas (movimientos que ajustan saldos, aportes/retiros de objetivos, finalización de períodos con snapshot) se ejecutan dentro de una transacción mediante `withTransaction` (`backend/src/config/db.ts`). El mismo pool se comparte vía inyección de dependencias en los repositorios para permitir consultas dentro de la misma transacción.

## Frontend

- **Core** (`frontend/src/app/core/`): `AuthService` (estado de sesión con signals), `ApiService` (HTTP con `withCredentials`), interceptors (credenciales y errores de autenticación), guards (`authGuard`, `adminGuard`) y modelos de API.
- **Features** (`frontend/src/app/features/`): módulos `auth`, `dashboard`, `periods`, `movements`, `objectives` y `admin`, cada uno con sus páginas y subpáginas. El enrutado usa **lazy loading** (`app.routes.ts`).
- **Layout**: shell con topbar tipo pill, sidebar dinámica (el contenido cambia según la sección), panel principal de vidrio (glassmorphism) y footer. Autorizado en `app.html`.
- **Rutas de aplicación**: `login`, `register`, `forgot-password`, `reset-password`, `dashboard` (+ `/movements`, `/income`, `/expenses`, `/reports`), `periods` (+ `/new`, `/edit`, `/finalize`, `/history`), `movements` (+ `/income`, `/expenses`, `/history/income`, `/history/expenses`), `objectives` (+ `/budget`), `admin` y redirección `budget → objectives`.

## Sesión y autenticación

1. **Registro/Login**: el backend valida credenciales y emite un **JWT de acceso** (corta duración) en una cookie `HttpOnly` (`SameSite=Lax`; `Secure` en producción) y un **refresh token** generado al azar, guardado con hash en `refresh_tokens` y devuelto al frontend.
2. **Almacenamiento frontend**: el token de acceso nunca se guarda en JavaScript; el refresh token se conserva en `localStorage` (clave `koinu_refresh_token`).
3. **Refresco**: el interceptor renueva la sesión con `POST /auth/refresh`. Cada refresco **revoca el token anterior** y emite uno nuevo (rotación). `GET /auth/me` actúa como latido de sesión mientras el usuario está activo.
4. **Límites de sesión**:
   - Duración máxima absoluta del refresh token: `JWT_REFRESH_EXPIRES_IN`.
   - Inactividad: si un request autenticado no refresca `last_used_at` de la sesión dentro de `SESSION_IDLE_TIMEOUT`, la sesión deja de poder renovarse (`SESSION_IDLE_EXPIRED`).
   - El backend devuelve el límite de inactividad en `login`/`me`/`refresh`/`google`; el frontend finaliza localmente la sesión (aviso "SESIÓN EXPIRADA") y pausa el latido de `GET /auth/me` durante la inactividad para que la sesión expire de verdad en el backend.
5. **Recuperación de contraseña**: `POST /auth/forgot-password` genera un token de un solo uso y con expiración (guardado con hash en `password_reset_tokens`); `POST /auth/reset-password` lo consume. En desarrollo el token se devuelve en la respuesta para probar el flujo.
6. **Google (opcional)**: `POST /auth/google` intercambia un ID token de Auth0 por una sesión. Sin credenciales Auth0, responde `GOOGLE_AUTH_NOT_CONFIGURED` y el resto de la autenticación sigue funcionando.

## Modelo de autorización

- Roles: `ADMIN` y `USR` (sembrados por migración).
- Todo registro público asigna `USR`; el usuario nunca puede autoelegirse `ADMIN`.
- El backend valida siempre rol y propiedad de recursos (`userId`). La protección de rutas del frontend no es una medida de seguridad, solo UX.
- El `ADMIN` gestiona usuarios, períodos globales y salud del sistema, pero **no** tiene endpoints para acceder a datos financieros de los usuarios.

## Diseño de datos

El presupuesto por período se calcula con el total de ingresos netos (`sum(movimientos.amount)` para `type = INCOME`). Los gastos se validan contra el disponible (ingresos − gastos) y contra el remanente de la asignación de su categoría cuando existe. Las tablas y relaciones se detallan en [database.md](database.md).

## Informes

- **Preliminar**: cálculos en vivo sobre los datos del período (`/periods/:periodId/reports/preliminary`).
- **Final**: snapshot inmutable generado al finalizar el período y consultable solo para períodos `FINISHED` (`/periods/:periodId/reports/final`). Se guarda en `snapshots_informes` con un índice único por período.
- **Auditoría**: cada creación/modificación/eliminación de movimientos se registra en `movimiento_auditoria` y se consulta por período (`/periods/:periodId/audit`).