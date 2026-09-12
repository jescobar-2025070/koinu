ALTER TABLE movimientos
    DROP CONSTRAINT chk_movimiento_categoria;

ALTER TABLE movimientos
    ADD CONSTRAINT chk_movimiento_categoria CHECK (
        (type = 'INCOME' AND income_category_id IS NOT NULL AND expense_category_id IS NULL)
        OR
        (type = 'EXPENSE' AND expense_category_id IS NOT NULL AND income_category_id IS NULL)
        OR
        (type = 'INCOME' AND income_category_id IS NULL AND expense_category_id IS NULL AND objetivo_id IS NOT NULL)
        OR
        (type = 'EXPENSE' AND income_category_id IS NULL AND expense_category_id IS NULL AND objetivo_id IS NOT NULL)
    );

ALTER TABLE movimientos
    DROP CONSTRAINT chk_mov_objetivo_income;

ALTER TABLE movimientos
    ADD CONSTRAINT chk_mov_objetivo_income CHECK (
        objetivo_id IS NULL OR type = 'INCOME' OR (type = 'EXPENSE' AND expense_category_id IS NULL)
    );