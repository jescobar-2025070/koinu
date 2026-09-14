-- Soporte de autenticación con Google mediante Auth0.
-- Los usuarios de Google no tienen contraseña local, por lo que password_hash
-- pasa a ser opcional. google_sub almacena el identificador estable (`sub`)
-- que Auth0 emite para la conexión de Google.

ALTER TABLE users
    ALTER COLUMN password_hash DROP NOT NULL,
    ADD COLUMN google_sub VARCHAR(255) UNIQUE,
    ADD COLUMN auth_provider VARCHAR(20) NOT NULL DEFAULT 'local'
        CHECK (auth_provider IN ('local', 'google'));
