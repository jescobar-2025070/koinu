# Koinu Finance

Aplicación web de **gestión de finanzas personales por períodos**. Permite a un usuario registrar, organizar y analizar sus ingresos, gastos, presupuestos y objetivos financieros dentro de períodos definidos por él mismo. Incluye un módulo administrativo estrictamente separado de la información financiera personal.

> La administración está aislada de las finanzas personales: el rol `ADMIN` gestiona usuarios y configuración técnica, pero **no** tiene endpoints para consultar las finanzas de los usuarios.

## Funcionalidades

- **Autenticación completa:** registro, inicio/cierre de sesión, JWT en cookie `HttpOnly`, refresh token rotativo, límite de inactividad de sesión, recuperación de contraseña (`forgot`/`reset`) y login con Google (Auth0, opcional).
- **Períodos:** ciclo de vida `ACTIVE → FINISHED/CANCELLED` con máximo un período activo por usuario, finalización con generación de snapshot e historial.
- **Movimientos:** ingresos con tratamiento fiscal (bruto / retención / neto calculado en el backend) y gastos con tipo fijo o variable, clasificados por categoría. Los gastos no pueden superar los fondos disponibles del período ni el remanente de la asignación de su categoría.
- **Categorías:** de ingreso y gasto, con predeterminadas globales y personalizadas por usuario.
- **Presupuestos:** total calculado automáticamente como los ingresos netos del período, con asignaciones por categoría de gasto.
- **Objetivos:** metas con prioridad, fecha límite y progreso; aportes/retiros registran movimientos automáticos y los ingresos pueden vincularse a un objetivo para aportar automáticamente.
- **Informes:** preliminar (en vivo) y final (snapshot inmutable del período finalizado), con recomendaciones y exportación CSV.
- **Auditoría:** trazabilidad de creación, modificación y eliminación de movimientos por período.
- **Panel de administración:** gestión de usuarios (crear, editar, activar/desactivar, roles, restablecer contraseña, eliminar), períodos y salud del sistema.

## Stack tecnológico

| Área | Tecnología |
| --- | --- |
| Frontend | Angular 22, TypeScript 6, pnpm, Vitest |
| Backend | Node.js ≥ 22, TypeScript 5.7, Express 4, pnpm |
| Base de datos | PostgreSQL 18, `pg` (node-postgres), migraciones SQL versionadas |
| Autenticación | JWT (`jsonwebtoken`) en cookie `HttpOnly`, `bcryptjs`, Auth0 (opcional) |
| Seguridad HTTP | `helmet`, `cors` con credenciales |
| Pruebas backend | `node:test`, `supertest`, `tsx` |
| Pruebas end-to-end | Playwright |

## Inicio rápido

**Requisitos:** Node.js ≥ 22, pnpm ≥ 11, PostgreSQL (18) y Git. Guía completa en [docs/installation.md](docs/installation.md).

### 1. Backend

```bash
cd backend
pnpm install
cp .env.example .env        # edita los valores reales
pnpm migrate                # crea el esquema (migraciones 001-025)
pnpm seed:full              # datos de demostración (usuarios, períodos, movimientos, objetivos)
pnpm dev                    # API en http://localhost:3000
```

### 2. Frontend

```bash
cd frontend
pnpm install
pnpm start                  # app en http://localhost:4200
```

### Credenciales de demostración

Tras ejecutar `pnpm seed:full` (valores por defecto, configurables por entorno):

| Usuario | Email | Contraseña | Rol |
| --- | --- | --- | --- |
| Usuario de prueba | `test@koinu.local` | `Test1234` | USR |
| Administrador | `admin@koinu.local` | `Admin1234` | ADMIN |

## Estructura del repositorio

```text
koinu/
├── backend/                # API REST (Express + TypeScript)
│   ├── src/
│   │   ├── config/         #   env, pool de PostgreSQL, transacciones
│   │   ├── controllers/    #   capa HTTP
│   │   ├── dto/            #   contratos de entrada/salida
│   │   ├── entities/       #   modelos de dominio
│   │   ├── errors/         #   AppError y catálogo de códigos
│   │   ├── middleware/     #   authenticate, authorize, validate, error-handler
│   │   ├── repositories/   #   persistencia
│   │   ├── routes/         #   rutas REST
│   │   ├── services/       #   lógica de negocio
│   │   ├── validators/     #   validadores de entrada
│   │   └── app.ts          #   construcción de la aplicación Express
│   ├── migrations/         # migraciones SQL versionadas
│   ├── scripts/            # migrate, seed, seed:full, e2e-prepare
│   └── package.json
├── frontend/               # SPA Angular
│   └── src/app/
│       ├── core/           # auth, guards, interceptors, servicios y modelos
│       ├── features/       # auth, dashboard, periods, movements, objectives, admin
│       ├── app.routes.ts   # rutas con lazy loading
│       └── environment.ts  # configuración de la app
├── docs/                   # documentación técnica y maquetación
└── README.md
```

## Arquitectura

Separación de capas `Controller → Service → Repository` en el backend y SPA Angular con lazy loading en el frontend. La sesión usa un JWT de corta duración en cookie `HttpOnly` más un refresh token rotativo almacenado con hash. Detalles en [docs/architecture.md](docs/architecture.md).

## Documentación

| Documento | Contenido |
| --- | --- |
| [docs/installation.md](docs/installation.md) | Requisitos e instalación paso a paso |
| [docs/configuration.md](docs/configuration.md) | Variables de entorno (backend y frontend) |
| [docs/architecture.md](docs/architecture.md) | Arquitectura, flujo de sesión y modelo de seguridad |
| [docs/api.md](docs/api.md) | Referencia completa de la API REST |
| [docs/database.md](docs/database.md) | Esquema de base de datos y migraciones |
| [docs/usage.md](docs/usage.md) | Guía de usuario por módulo |
| [docs/security.md](docs/security.md) | Detalle de seguridad y buenas prácticas |
| [docs/testing.md](docs/testing.md) | Cómo ejecutar y ampliar las pruebas |
| [docs/decisions.md](docs/decisions.md) | Decisiones de diseño y limitaciones conocidas |
| [docs/diseno/](docs/diseno/) | Maquetaciones de referencia (PDF) |

## Pruebas

- Backend: `node:test` + `supertest` (20 archivos, ~154 casos) contra una base `finanzas_test`.
- Frontend: Vitest integrado por Angular CLI (12 especificaciones, ~91 casos).
- E2E: Playwright.

Ver [docs/testing.md](docs/testing.md) para ejecutarlas.

## Serie de documentación anterior

Los documentos `ERRORES_Y_SOLUCIONES.md`, `Desarrollo.md`, `ANÁLISIS_DEL_SISTEMA.txt` y `DISEÑO_DEL_SISTEMA.txt` mencionados en versiones previas de este README **no forman parte** de este proyecto; la documentación oficial vive únicamente en este archivo y en `docs/`.