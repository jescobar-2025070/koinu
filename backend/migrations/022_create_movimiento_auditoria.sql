CREATE TABLE movimiento_auditoria (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    movimiento_id UUID NOT NULL,
    periodo_id UUID NOT NULL REFERENCES periodos(id) ON DELETE CASCADE,
    user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    tipo VARCHAR(20) NOT NULL CHECK (tipo IN ('CREADO', 'MODIFICADO', 'ELIMINADO')),
    resumen JSONB NOT NULL DEFAULT '{}'::jsonb,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_auditoria_periodo ON movimiento_auditoria (periodo_id, created_at DESC);
CREATE INDEX idx_auditoria_movimiento ON movimiento_auditoria (movimiento_id);