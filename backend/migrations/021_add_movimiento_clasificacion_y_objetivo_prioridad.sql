ALTER TABLE movimientos
    ADD COLUMN income_classification VARCHAR(20),
    ADD COLUMN expense_type VARCHAR(20);

ALTER TABLE movimientos
    ADD CONSTRAINT chk_mov_income_classification CHECK (
        income_classification IS NULL OR income_classification IN ('REGULAR', 'OCASIONAL')
    ),
    ADD CONSTRAINT chk_mov_expense_type CHECK (
        expense_type IS NULL OR expense_type IN ('FIJO', 'VARIABLE')
    );

ALTER TABLE objetivos
    ADD COLUMN priority VARCHAR(20) NOT NULL DEFAULT 'MEDIA',
    ADD CONSTRAINT chk_objetivo_priority CHECK (priority IN ('ALTA', 'MEDIA', 'BAJA'));