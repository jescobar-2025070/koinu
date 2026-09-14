# Instalación

## Requisitos previos

| Requisito | Versión | Notas |
| --- | --- | --- |
| Node.js | ≥ 22 | Verificado con Node 22+ |
| pnpm | ≥ 11 | Gestor de paquetes |
| PostgreSQL | ≥ 14 | Verificado con PostgreSQL 18 |
| Git | — | Control de versiones |

## 1. Obtener el proyecto

```bash
git clone <url-del-repositorio>
cd koinu
```

## 2. Crear las bases de datos

Coherente con [configuration.md](configuration.md), el backend espera una base de datos por entorno. Crea al menos la de desarrollo:

```bash
psql -U <usuario> -h localhost -c "CREATE DATABASE finanzas_dev;"
psql -U <usuario> -h localhost -c "CREATE DATABASE finanzas_test;"   # solo para ejecutar las pruebas
```

## 3. Backend

```bash
cd backend
pnpm install
cp .env.example .env
```

Edita `.env` y ajusta al menos:

- `DATABASE_URL` — cadena de conexión PostgreSQL (`postgresql://usuario:password@localhost:5432/finanzas_dev`)
- `JWT_SECRET` — secreto de firma de los JWT (genera uno con `openssl rand -hex 64`)

Ejecuta las migraciones (crean el esquema completo, migraciones 001-025):

```bash
pnpm migrate
```

Opcionalmente crea el administrador inicial (usa `ADMIN_EMAIL`/`ADMIN_PASSWORD` de `.env`; `ADMIN_PASSWORD` es obligatorio para este script):

```bash
pnpm seed
```

O carga datos de demostración completos (usuarios `USR` y `ADMIN`, categorías, períodos, movimientos y objetivos):

```bash
pnpm seed:full
```

Inicia el servidor de desarrollo (recarga automática):

```bash
pnpm dev
```

La API queda disponible en `http://localhost:3000/api/v1`.

### Otros comandos del backend

| Comando | Descripción |
| --- | --- |
| `pnpm build` | Compila TypeScript a `dist/` |
| `pnpm start` | Ejecuta el build compilado |
| `pnpm typecheck` | Verificación de tipos sin emitir |
| `pnpm test` | Ejecuta las pruebas del backend (ver [testing.md](testing.md)) |
| `pnpm e2e:prepare` | Prepara la base de datos para las pruebas E2E |

## 4. Frontend

```bash
cd frontend
pnpm install
pnpm start
```

La aplicación queda disponible en `http://localhost:4200`. El frontend apunta por defecto a `http://localhost:3000/api/v1` (configurable en `src/app/core/config/environment.ts`, ver [configuration.md](configuration.md)).

## 5. Verificación

1. Abre `http://localhost:4200` y regístrate, o usa las credenciales de demostración (`test@koinu.local` / `Test1234`).
2. El dashboard muestra el período activo con sus estadísticas.
3. `GET /health` en `http://localhost:3000/health` responde `{ "status": "ok" }`.

## Credenciales de demostración

Tras `pnpm seed:full` (valores por defecto; se sobrescriben con `TEST_EMAIL`, `TEST_PASSWORD`, `ADMIN_EMAIL` y `ADMIN_PASSWORD`):

| Usuario | Email | Contraseña | Rol |
| --- | --- | --- | --- |
| Usuario de prueba | `test@koinu.local` | `Test1234` | USR |
| Administrador | `admin@koinu.local` | `Admin1234` | ADMIN |

## Solución de problemas

- **`DATABASE_URL` apunta a una base que no existe**: crea la base o verifica la cadena en `.env`.
- **Error de migración de permisos**: el usuario de la base de datos necesita privilegios de DDL (`CREATE TABLE`, `ALTER`, `DROP`).
- **CORS en el frontend**: si el puerto del backend o del frontend cambia, actualiza `CORS_ORIGIN` en `.env` del backend y `apiUrl` en `environment.ts` del frontend.
- **No hay período activo al iniciar sesión**: crea uno desde `PERÍODOS → NUEVO PERÍODO`; el dashboard se muestra vacío hasta que exista.