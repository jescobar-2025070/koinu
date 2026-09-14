# Configuración

## Backend (`backend/.env`)

Copia `backend/.env.example` a `backend/.env` y ajusta los valores. Ningún valor sensible debe subirse al repositorio (`.env` está en `.gitignore`).

| Variable | Propósito | Ejemplo | Obligatoria |
| --- | --- | --- | --- |
| `NODE_ENV` | Entorno de ejecución: `development`, `test`, `production` | `development` | Sí |
| `PORT` | Puerto HTTP del backend | `3000` | No (por defecto `3000`) |
| `DATABASE_URL` | Cadena de conexión a PostgreSQL | `postgresql://usuario:pass@localhost:5432/finanzas_dev` | Sí |
| `JWT_SECRET` | Secreto para firmar los JWT | valor aleatorio (`openssl rand -hex 64`) | Sí |
| `JWT_EXPIRES_IN` | Duración del access token JWT (formato `jsonwebtoken`) | `15m` | No |
| `JWT_REFRESH_EXPIRES_IN` | Duración máxima absoluta del refresh token (límite superior de la sesión) | `7d` | No |
| `SESSION_IDLE_TIMEOUT` | Tiempo máximo de inactividad antes de que la sesión deje de renovarse (formatos `ms/s/m/h/d`) | `30m` | No |
| `COOKIE_NAME` | Nombre de la cookie `HttpOnly` | `finanzas_auth` | No |
| `COOKIE_SECURE` | Cookie `Secure` (solo HTTPS) | `false` en desarrollo, `true` en producción | No |
| `CORS_ORIGIN` | Orígenes permitidos para CORS, separados por coma | `http://localhost:4200` | No |
| `BCRYPT_ROUNDS` | Coste del hash de contraseñas | `12` | No |
| `ADMIN_EMAIL` / `ADMIN_PASSWORD` | Credenciales del administrador para `pnpm seed` y `pnpm seed:full` | `admin@finanzas.local` / valor fuerte | Solo para seed |
| `TEST_EMAIL` / `TEST_PASSWORD` | Credenciales del usuario de demostración para `pnpm seed:full` | `test@koinu.local` / `Test1234` | Solo para seed |
| `AUTH0_DOMAIN` / `AUTH0_CLIENT_ID` | Dominio y client ID del tenant de Auth0 para login con Google | — | Opcional |
| `NODE_TLS_REJECT_UNAUTHORIZED` | Deshabilitar validación TLS (solo desarrollo) | `"0"` | Solo desarrollo |

Si no se configuran credenciales Auth0, `/auth/google` responde `GOOGLE_AUTH_NOT_CONFIGURED` y el resto de la autenticación funciona con normalidad.

## Backend para pruebas (`backend/.env.test`)

Copia `backend/.env.test.example` a `backend/.env.test` para ejecutar las pruebas. Usa un puerto y una base distintos de los de desarrollo:

| Variable | Valor de ejemplo |
| --- | --- |
| `NODE_ENV` | `test` |
| `PORT` | `3100` |
| `DATABASE_URL` | `postgresql://usuario:pass@localhost:5432/finanzas_test` |

## Frontend (`frontend/src/app/core/config/environment.ts`)

```typescript
export const environment = {
  production: false,
  apiUrl: 'http://localhost:3000/api/v1',
  sessionIdleTimeoutMs: 30 * 60 * 1000,
};
```

- `apiUrl`: URL base de la API. Debe apuntar al backend y coincidir con el origen permitido en `CORS_ORIGIN`.
- `sessionIdleTimeoutMs`: respaldo local del límite de inactividad; **el valor autoritativo lo devuelve el backend** en `login`/`me`/`refresh`/`google` y debería coincidir con `SESSION_IDLE_TIMEOUT`.

> El archivo `environment.ts` actual incluye credenciales de desarrollo de Auth0 (login con Google). No las publiques ni las reutilices en producción.

## Consideraciones de producción

- `COOKIE_SECURE=true` y servir la aplicación por HTTPS.
- `JWT_SECRET` con un valor aleatorio y largo (mínimo 32 caracteres).
- `DATABASE_URL` con credenciales de un usuario con privilegios mínimos necesarios.
- `NODE_TLS_REJECT_UNAUTHORIZED` no debe estar en `"0"`.
- El proyecto no incluye manifiestos de despliegue (Docker/CI); el despliegue se realiza con los artefactos de `pnpm build` del frontend y `pnpm build` + `pnpm start` del backend.