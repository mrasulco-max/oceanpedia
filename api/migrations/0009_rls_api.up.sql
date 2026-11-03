-- Row Level Security aktif di semua tabel skema aplikasi (pertahanan berlapis: peran lain, mis. anon
-- PostgREST, tidak melihat apa pun). Peran khusus API (oceanpedia_api, bila ada) diberi akses penuh lewat
-- kebijakan eksplisit — tanpa ini API membaca 0 baris (login gagal, beranda kosong).
DO $$
DECLARE t record;
BEGIN
  FOR t IN SELECT c.relname FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace
           WHERE n.nspname = current_schema() AND c.relkind = 'r' LOOP
    EXECUTE format('ALTER TABLE %I ENABLE ROW LEVEL SECURITY', t.relname);
    IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'oceanpedia_api') THEN
      EXECUTE format('DROP POLICY IF EXISTS api_all ON %I', t.relname);
      EXECUTE format('CREATE POLICY api_all ON %I FOR ALL TO oceanpedia_api USING (true) WITH CHECK (true)', t.relname);
    END IF;
  END LOOP;
END $$;
