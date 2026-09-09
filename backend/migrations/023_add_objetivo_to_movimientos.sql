ALTER TABLE movimientos
    ADD COLUMN objetivo_id UUID REFERENCES objetivos(id) ON DELETE SET NULL;

ALTER TABLE movimientos
    ADD CONSTRAINT chk_mov_objetivo_income CHECK (
        objetivo_id IS NULL OR type = 'INCOME'
    );

CREATE INDEX idx_movimientos_objetivo_id ON movimientos (objetivo_id);