# Seguridad

## Autenticación

- **Contraseñas** con hash `bcrypt` (coste configurable `BCRYPT_ROUNDS`).
- **JWT de acceso** firmado con `JWT_SECRET`, de corta duración (`JWT_EXPIRES_IN`, recomendado `15m`), con `sub` (id de usuario), `email`, `roles` y `sid` (id de la sesión en `refresh_tokens`).
- **Cookie `HttpOnly`** transporta el JWT: el JavaScript del cliente no puede leerlo. `SameSite=Lax` y `Secure` en producción (HTTPS).
- El frontend **nunca almacena el token de acceso**; restaura la sesión con `GET /auth/me` y envía la cookie automáticamente (`withCredentials: true`).

## Refresh token rotativo

- El refresh token se guarda **con hash** (`token_hash`) en `refresh_tokens`.
- Cada refresco **revoca el token anterior** y emite uno nuevo; el uso de un token ya revocado invalida la sesión.
- Límites de sesión:
  - Duración absoluta máxima: `JWT_REFRESH_EXPIRES_IN`.
  - **Inactividad**: `last_used_at` se actualiza en cada refresco y en cada request autenticado; si el tiempo transcurrido supera `SESSION_IDLE_TIMEOUT`, la sesión deja de renovarse (`SESSION_IDLE_EXPIRED`, 401).
- `logout` revoca el refresh token de la sesión actual.

## Autorización

- Roles: `ADMIN` y `USR`. El registro público asigna **siempre** `USR`; nunca es posible autoelegirse `ADMIN`.
- La validación de rol (`requireRole`) y la **propiedad de los recursos** (`userId`) se comprueban siempre en el backend; la protección de rutas del frontend es solo complementaria.
- Aislamiento funcional: el rol `ADMIN` gestiona usuarios y períodos, pero **no tiene endpoints** para acceder a datos financieros personales.

## Validación de entrada

- Validadores propios en el backend (`backend/src/validators/`) aplicados vía middleware `validate` **antes** de los controllers.
- El frontend valida para UX, pero el backend es la autoridad.
- Límites de tamaño de cuerpo JSON (`1mb` en `express.json`).
- Las cantidades monetarias se validan arriba y abajo (mínimo `> 0`, máximo `Q 999,999,999,999.99`) y las fechas dentro del período y no futuras.

## Recuperación de contraseña

- `POST /auth/forgot-password` genera un token de **un solo uso** con expiración, guardado **con hash** en `password_reset_tokens`.
- `POST /auth/reset-password` lo consume y fija la nueva contraseña; los tokens usados se marcan con `used_at`.
- En desarrollo el token se devuelve en la respuesta para facilitar la prueba del flujo; en producción se envía por el canal de notificación correspondiente.

## Capa HTTP

- **helmet** con cabeceras de seguridad por defecto; `app.disable('x-powered-by')`.
- **CORS** con orígenes explícitos (`CORS_ORIGIN`, separados por coma) y `credentials: true`.
- **Manejo centralizado de errores**: formato JSON estandarizado, sin stack traces ni información interna expuesta al cliente.

## Buenas prácticas para operación

1. Generar un `JWT_SECRET` fuerte y aleatorio (`openssl rand -hex 64`); nunca usar los valores de ejemplo.
2. `COOKIE_SECURE=true` y servir todo por HTTPS en producción.
3. Credenciales de la base de datos con privilegios mínimos (migraciones requieren DDL solo en despliegue).
4. Mantener `NODE_TLS_REJECT_UNAUTHORIZED` sin `"0"` fuera de desarrollo.
5. Las credenciales de Auth0 de desarrollo presentes en el frontend no deben usarse ni publicarse en producción.
6. Sin despliegue automático configurado (no hay manifestos Docker/CI); revisar secretos y cabeceras al desplegar.

## Nota sobre el cliente

El `localStorage` guarda el refresh token (clave `koinu_refresh_token`). Esto es necesario para la renovación de la sesión entre recargas; el valor está limitado a su índice en `refresh_tokens` (hash) y la rotación mitiga el riesgo de reutilización.