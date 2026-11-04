-- Jurnal Trading: ukuran kontrak per lot (forex 100.000, emas 100 oz, saham/crypto 1).
ALTER TABLE trading_journal ADD COLUMN IF NOT EXISTS contract_size numeric(20, 4) NOT NULL DEFAULT 1 CHECK (contract_size > 0);
