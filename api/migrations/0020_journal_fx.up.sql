-- Jurnal Trading: konversi P/L dari mata uang kuotasi ke mata uang akun pada kurs saat posisi ditutup.
ALTER TABLE trading_journal ADD COLUMN IF NOT EXISTS quote_currency text NOT NULL DEFAULT '' CHECK (char_length(quote_currency) <= 5);
ALTER TABLE trading_journal ADD COLUMN IF NOT EXISTS fx_rate numeric(28, 12) CHECK (fx_rate > 0);
ALTER TABLE trading_journal ADD COLUMN IF NOT EXISTS fx_source text NOT NULL DEFAULT '' CHECK (fx_source IN ('', 'same', 'price', 'market', 'manual'));
