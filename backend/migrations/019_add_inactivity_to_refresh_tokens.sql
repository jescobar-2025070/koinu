-- Control de inactividad de sesión (refresh tokens).
-- `last_used_at` registra la última actividad de la sesión: se actualiza en
-- cada refresco y en cada request autenticado. Si el tiempo transcurrido desde
-- `last_used_at` supera SESSION_IDLE_TIMEOUT, la sesión deja de poder renovarse.
ALTER TABLE refresh_tokens
    ADD COLUMN last_used_at TIMESTAMPTZ NOT NULL DEFAULT NOW();

CREATE INDEX idx_refresh_tokens_expires_at ON refresh_tokens (expires_at);