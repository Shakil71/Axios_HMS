-- Apply after the initial Prisma migration (include in a custom migration).
-- Makes audit_logs and document_access_logs append-only, even for the application DB role.

CREATE OR REPLACE FUNCTION forbid_mutation() RETURNS trigger AS $$
BEGIN
  RAISE EXCEPTION '% on % is not allowed: table is append-only', TG_OP, TG_TABLE_NAME;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER audit_logs_immutable
  BEFORE UPDATE OR DELETE ON audit_logs
  FOR EACH ROW EXECUTE FUNCTION forbid_mutation();

CREATE TRIGGER document_access_logs_immutable
  BEFORE UPDATE OR DELETE ON document_access_logs
  FOR EACH ROW EXECUTE FUNCTION forbid_mutation();

-- Human-readable case / invoice numbers.
CREATE SEQUENCE IF NOT EXISTS case_number_seq START 1;
CREATE SEQUENCE IF NOT EXISTS invoice_number_seq START 1;

-- Least-privilege runtime role (run once per environment, password from secret manager):
--   CREATE ROLE hms_app LOGIN PASSWORD '...';
--   GRANT SELECT, INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA public TO hms_app;
--   REVOKE UPDATE, DELETE, TRUNCATE ON audit_logs, document_access_logs FROM hms_app;
