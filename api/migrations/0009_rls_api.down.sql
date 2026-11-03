DO $$
DECLARE t record;
BEGIN
  FOR t IN SELECT c.relname FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace
           WHERE n.nspname = current_schema() AND c.relkind = 'r' LOOP
    EXECUTE format('DROP POLICY IF EXISTS api_all ON %I', t.relname);
  END LOOP;
END $$;
