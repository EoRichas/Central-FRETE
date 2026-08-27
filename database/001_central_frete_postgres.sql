-- Central Frete: esquema PostgreSQL idempotente para Supabase.
-- Os horários permanecem em ISO-8601 textual para compatibilidade com a aplicação.

BEGIN;

SELECT pg_advisory_xact_lock(hashtext('central-frete-schema-v1'));

CREATE TABLE IF NOT EXISTS public.users (
  id text PRIMARY KEY,
  email text NOT NULL,
  username text,
  password_salt text,
  password_hash text,
  pix_details text,
  name text NOT NULL,
  role text NOT NULL CHECK (role IN ('ADMIN', 'GERENCIA', 'VENDEDOR', 'FINANCEIRO')),
  active integer NOT NULL DEFAULT 1 CHECK (active IN (0, 1)),
  created_at text NOT NULL DEFAULT (to_char(timezone('UTC', now()), 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"')),
  updated_at text NOT NULL DEFAULT (to_char(timezone('UTC', now()), 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"'))
);

ALTER TABLE public.users ADD COLUMN IF NOT EXISTS username text;
ALTER TABLE public.users ADD COLUMN IF NOT EXISTS password_salt text;
ALTER TABLE public.users ADD COLUMN IF NOT EXISTS password_hash text;
ALTER TABLE public.users ADD COLUMN IF NOT EXISTS pix_details text;

CREATE UNIQUE INDEX IF NOT EXISTS users_email_unique ON public.users (email);
CREATE UNIQUE INDEX IF NOT EXISTS users_username_unique ON public.users (username);

CREATE TABLE IF NOT EXISTS public.clients (
  id text PRIMARY KEY,
  type text NOT NULL CHECK (type IN ('PF', 'PJ')),
  legal_name text NOT NULL,
  trade_name text,
  cpf_cnpj text,
  state_registration text,
  notes text,
  active integer NOT NULL DEFAULT 1 CHECK (active IN (0, 1)),
  created_at text NOT NULL DEFAULT (to_char(timezone('UTC', now()), 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"')),
  updated_at text NOT NULL DEFAULT (to_char(timezone('UTC', now()), 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"'))
);

CREATE UNIQUE INDEX IF NOT EXISTS clients_document_unique ON public.clients (cpf_cnpj);
CREATE INDEX IF NOT EXISTS clients_legal_name_idx ON public.clients (legal_name);

CREATE TABLE IF NOT EXISTS public.providers (
  id text PRIMARY KEY,
  name text NOT NULL,
  document text,
  phone text,
  email text,
  reference_name text,
  yard_address text,
  active integer NOT NULL DEFAULT 1 CHECK (active IN (0, 1)),
  created_at text NOT NULL DEFAULT (to_char(timezone('UTC', now()), 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"')),
  updated_at text NOT NULL DEFAULT (to_char(timezone('UTC', now()), 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"'))
);

ALTER TABLE public.providers ADD COLUMN IF NOT EXISTS reference_name text;
ALTER TABLE public.providers ADD COLUMN IF NOT EXISTS yard_address text;

CREATE UNIQUE INDEX IF NOT EXISTS providers_document_unique ON public.providers (document);
CREATE INDEX IF NOT EXISTS providers_name_idx ON public.providers (name);

CREATE TABLE IF NOT EXISTS public.financial_accounts (
  id text PRIMARY KEY,
  name text NOT NULL,
  active integer NOT NULL DEFAULT 1 CHECK (active IN (0, 1)),
  created_at text NOT NULL DEFAULT (to_char(timezone('UTC', now()), 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"')),
  updated_at text NOT NULL DEFAULT (to_char(timezone('UTC', now()), 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"'))
);

CREATE UNIQUE INDEX IF NOT EXISTS financial_accounts_name_unique ON public.financial_accounts (name);

CREATE TABLE IF NOT EXISTS public.freight_sales (
  id text PRIMARY KEY,
  sale_number text NOT NULL,
  sale_date text NOT NULL,
  competency text NOT NULL,
  seller_id text REFERENCES public.users (id) ON DELETE SET NULL,
  seller_name text NOT NULL,
  client_id text REFERENCES public.clients (id) ON DELETE SET NULL,
  vehicle text,
  plate text,
  initial_provider_id text REFERENCES public.providers (id) ON DELETE SET NULL,
  initial_provider_name text,
  origin text NOT NULL,
  destination text NOT NULL,
  pickup_address_snapshot text,
  delivery_address_snapshot text,
  delivery_deadline text,
  financial_due_date text NOT NULL,
  operational_status text NOT NULL,
  legacy_operational_status text,
  operational_deadline_days integer,
  origin_yard_entry_date text,
  notes text,
  freight_amount_cents bigint NOT NULL CHECK (freight_amount_cents >= 0),
  commission_basis_points integer NOT NULL CHECK (commission_basis_points BETWEEN 0 AND 10000),
  costs_pending integer NOT NULL DEFAULT 1 CHECK (costs_pending IN (0, 1)),
  import_key text,
  source_workbook text,
  source_sheet text,
  source_month text,
  source_row integer,
  source_hash text,
  created_by text NOT NULL,
  created_at text NOT NULL DEFAULT (to_char(timezone('UTC', now()), 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"')),
  updated_at text NOT NULL DEFAULT (to_char(timezone('UTC', now()), 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"'))
);

ALTER TABLE public.freight_sales ADD COLUMN IF NOT EXISTS operational_deadline_days integer;
ALTER TABLE public.freight_sales ADD COLUMN IF NOT EXISTS origin_yard_entry_date text;

CREATE UNIQUE INDEX IF NOT EXISTS freight_sales_number_unique ON public.freight_sales (sale_number);
CREATE UNIQUE INDEX IF NOT EXISTS freight_sales_import_key_unique ON public.freight_sales (import_key);
CREATE INDEX IF NOT EXISTS freight_sales_competency_idx ON public.freight_sales (competency);
CREATE INDEX IF NOT EXISTS freight_sales_client_idx ON public.freight_sales (client_id);
CREATE INDEX IF NOT EXISTS freight_sales_seller_idx ON public.freight_sales (seller_id);
CREATE INDEX IF NOT EXISTS freight_sales_provider_idx ON public.freight_sales (initial_provider_id);
CREATE INDEX IF NOT EXISTS freight_sales_due_date_idx ON public.freight_sales (financial_due_date);

CREATE TABLE IF NOT EXISTS public.client_contacts (
  id text PRIMARY KEY,
  client_id text NOT NULL REFERENCES public.clients (id) ON DELETE CASCADE,
  name text NOT NULL,
  phone text,
  whatsapp text,
  email text,
  is_primary integer NOT NULL DEFAULT 0 CHECK (is_primary IN (0, 1)),
  created_at text NOT NULL DEFAULT (to_char(timezone('UTC', now()), 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"')),
  updated_at text NOT NULL DEFAULT (to_char(timezone('UTC', now()), 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"'))
);

CREATE INDEX IF NOT EXISTS client_contacts_client_idx ON public.client_contacts (client_id);

CREATE TABLE IF NOT EXISTS public.client_addresses (
  id text PRIMARY KEY,
  client_id text NOT NULL REFERENCES public.clients (id) ON DELETE CASCADE,
  type text NOT NULL CHECK (type IN ('COBRANCA', 'COLETA', 'ENTREGA')),
  label text,
  contact_name text,
  phone text,
  cep text,
  street text NOT NULL,
  number text NOT NULL,
  complement text,
  district text NOT NULL,
  city text NOT NULL,
  state text NOT NULL,
  is_primary integer NOT NULL DEFAULT 0 CHECK (is_primary IN (0, 1)),
  created_at text NOT NULL DEFAULT (to_char(timezone('UTC', now()), 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"')),
  updated_at text NOT NULL DEFAULT (to_char(timezone('UTC', now()), 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"'))
);

CREATE INDEX IF NOT EXISTS client_addresses_client_idx ON public.client_addresses (client_id);

CREATE TABLE IF NOT EXISTS public.freight_costs (
  id text PRIMARY KEY,
  sale_id text NOT NULL REFERENCES public.freight_sales (id) ON DELETE CASCADE,
  category text NOT NULL,
  provider_id text REFERENCES public.providers (id) ON DELETE SET NULL,
  provider_name text,
  description text,
  occurred_on text,
  amount_cents bigint NOT NULL CHECK (amount_cents >= 0),
  confirmed integer NOT NULL DEFAULT 0 CHECK (confirmed IN (0, 1)),
  provider_slot integer,
  payment_status text DEFAULT 'NAO_APLICAVEL' CHECK (payment_status IN ('NAO_APLICAVEL', 'EM_ABERTO', 'PAGO')),
  paid_at text,
  paid_by text REFERENCES public.users (id) ON DELETE SET NULL,
  pix_details text,
  source_column text,
  created_at text NOT NULL DEFAULT (to_char(timezone('UTC', now()), 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"')),
  updated_at text NOT NULL DEFAULT (to_char(timezone('UTC', now()), 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"'))
);

ALTER TABLE public.freight_costs ADD COLUMN IF NOT EXISTS provider_slot integer;
ALTER TABLE public.freight_costs ADD COLUMN IF NOT EXISTS payment_status text DEFAULT 'NAO_APLICAVEL';
ALTER TABLE public.freight_costs ADD COLUMN IF NOT EXISTS paid_at text;
ALTER TABLE public.freight_costs ADD COLUMN IF NOT EXISTS paid_by text;
ALTER TABLE public.freight_costs ADD COLUMN IF NOT EXISTS pix_details text;

CREATE INDEX IF NOT EXISTS freight_costs_sale_idx ON public.freight_costs (sale_id);
CREATE INDEX IF NOT EXISTS freight_costs_category_idx ON public.freight_costs (category);
CREATE INDEX IF NOT EXISTS freight_costs_provider_idx ON public.freight_costs (provider_id);
CREATE INDEX IF NOT EXISTS freight_costs_paid_by_idx ON public.freight_costs (paid_by);

CREATE TABLE IF NOT EXISTS public.receivable_installments (
  id text PRIMARY KEY,
  sale_id text NOT NULL REFERENCES public.freight_sales (id) ON DELETE CASCADE,
  installment_number integer NOT NULL,
  installment_count integer NOT NULL,
  due_date text NOT NULL,
  payment_method text NOT NULL,
  financial_account_id text REFERENCES public.financial_accounts (id) ON DELETE SET NULL,
  expected_amount_cents bigint NOT NULL CHECK (expected_amount_cents >= 0),
  notes text,
  created_at text NOT NULL DEFAULT (to_char(timezone('UTC', now()), 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"')),
  updated_at text NOT NULL DEFAULT (to_char(timezone('UTC', now()), 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"')),
  CONSTRAINT receivable_installments_numbers_check
    CHECK (installment_number > 0 AND installment_count >= installment_number)
);

CREATE UNIQUE INDEX IF NOT EXISTS receivable_installments_sale_number_unique
  ON public.receivable_installments (sale_id, installment_number);
CREATE INDEX IF NOT EXISTS receivable_installments_due_idx ON public.receivable_installments (due_date);
CREATE INDEX IF NOT EXISTS receivable_installments_account_idx
  ON public.receivable_installments (financial_account_id);

CREATE TABLE IF NOT EXISTS public.payment_transactions (
  id text PRIMARY KEY,
  sale_id text NOT NULL REFERENCES public.freight_sales (id) ON DELETE CASCADE,
  installment_id text REFERENCES public.receivable_installments (id) ON DELETE SET NULL,
  type text NOT NULL CHECK (type IN ('ADIANTAMENTO', 'RECEBIMENTO', 'ESTORNO')),
  status text NOT NULL CHECK (status IN ('PENDENTE', 'CONFIRMADO', 'CANCELADO')),
  amount_cents bigint NOT NULL CHECK (amount_cents > 0),
  occurred_at text NOT NULL,
  payment_method text NOT NULL,
  financial_account_id text REFERENCES public.financial_accounts (id) ON DELETE SET NULL,
  notes text,
  reversed_transaction_id text,
  idempotency_key text NOT NULL,
  proof_key text,
  proof_name text,
  created_by text NOT NULL,
  created_at text NOT NULL DEFAULT (to_char(timezone('UTC', now()), 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"')),
  updated_at text NOT NULL DEFAULT (to_char(timezone('UTC', now()), 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"'))
);

CREATE UNIQUE INDEX IF NOT EXISTS payment_transactions_idempotency_unique
  ON public.payment_transactions (idempotency_key);
CREATE UNIQUE INDEX IF NOT EXISTS payment_transactions_reverse_unique
  ON public.payment_transactions (reversed_transaction_id);
CREATE INDEX IF NOT EXISTS payment_transactions_sale_idx ON public.payment_transactions (sale_id);
CREATE INDEX IF NOT EXISTS payment_transactions_installment_idx
  ON public.payment_transactions (installment_id);
CREATE INDEX IF NOT EXISTS payment_transactions_account_idx
  ON public.payment_transactions (financial_account_id);
CREATE INDEX IF NOT EXISTS payment_transactions_occurred_idx ON public.payment_transactions (occurred_at);

CREATE TABLE IF NOT EXISTS public.import_runs (
  id text PRIMARY KEY,
  import_key text NOT NULL,
  workbook_name text NOT NULL,
  source_hash text NOT NULL,
  status text NOT NULL,
  valid_rows integer NOT NULL,
  warning_rows integer NOT NULL,
  error_rows integer NOT NULL,
  imported_by text NOT NULL,
  created_at text NOT NULL DEFAULT (to_char(timezone('UTC', now()), 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"'))
);

CREATE UNIQUE INDEX IF NOT EXISTS import_runs_key_unique ON public.import_runs (import_key);

CREATE TABLE IF NOT EXISTS public.audit_logs (
  id text PRIMARY KEY,
  entity_type text NOT NULL,
  entity_id text NOT NULL,
  action text NOT NULL,
  actor_user_id text REFERENCES public.users (id) ON DELETE SET NULL,
  actor_email text NOT NULL,
  previous_value text,
  new_value text,
  request_id text,
  created_at text NOT NULL DEFAULT (to_char(timezone('UTC', now()), 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"'))
);

CREATE INDEX IF NOT EXISTS audit_logs_entity_idx ON public.audit_logs (entity_type, entity_id);
CREATE INDEX IF NOT EXISTS audit_logs_created_idx ON public.audit_logs (created_at);
CREATE INDEX IF NOT EXISTS audit_logs_actor_idx ON public.audit_logs (actor_user_id);

CREATE TABLE IF NOT EXISTS public.seller_commission_statuses (
  id text PRIMARY KEY,
  seller_name text NOT NULL,
  competency text NOT NULL,
  status text NOT NULL DEFAULT 'EM_ABERTO' CHECK (status IN ('EM_ABERTO', 'PAGO')),
  paid_at text,
  paid_by text REFERENCES public.users (id) ON DELETE SET NULL,
  created_at text NOT NULL DEFAULT (to_char(timezone('UTC', now()), 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"')),
  updated_at text NOT NULL DEFAULT (to_char(timezone('UTC', now()), 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"'))
);

CREATE UNIQUE INDEX IF NOT EXISTS seller_commission_statuses_seller_competency_unique
  ON public.seller_commission_statuses (seller_name, competency);
CREATE INDEX IF NOT EXISTS seller_commission_statuses_competency_idx
  ON public.seller_commission_statuses (competency);
CREATE INDEX IF NOT EXISTS seller_commission_statuses_status_idx
  ON public.seller_commission_statuses (status);
CREATE INDEX IF NOT EXISTS seller_commission_statuses_paid_by_idx
  ON public.seller_commission_statuses (paid_by);

CREATE TABLE IF NOT EXISTS public.seller_payment_profiles (
  seller_name text PRIMARY KEY,
  pix_details text,
  created_at text NOT NULL DEFAULT (to_char(timezone('UTC', now()), 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"')),
  updated_at text NOT NULL DEFAULT (to_char(timezone('UTC', now()), 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"'))
);

CREATE TABLE IF NOT EXISTS public.sale_attachments (
  id text PRIMARY KEY,
  sale_id text NOT NULL REFERENCES public.freight_sales (id) ON DELETE CASCADE,
  storage_key text NOT NULL UNIQUE,
  file_name text NOT NULL,
  mime_type text NOT NULL,
  size_bytes integer NOT NULL CHECK (size_bytes > 0),
  description text,
  uploaded_by text REFERENCES public.users (id) ON DELETE SET NULL,
  uploaded_at text NOT NULL DEFAULT (to_char(timezone('UTC', now()), 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"'))
);

CREATE INDEX IF NOT EXISTS sale_attachments_sale_idx
  ON public.sale_attachments (sale_id, uploaded_at);
CREATE INDEX IF NOT EXISTS sale_attachments_uploaded_by_idx
  ON public.sale_attachments (uploaded_by);

CREATE TABLE IF NOT EXISTS public.editable_tool_documents (
  document_key text NOT NULL,
  owner_key text NOT NULL,
  payload jsonb NOT NULL CHECK (jsonb_typeof(payload) = 'object'),
  updated_by text REFERENCES public.users (id) ON DELETE SET NULL,
  created_at text NOT NULL DEFAULT (to_char(timezone('UTC', now()), 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"')),
  updated_at text NOT NULL DEFAULT (to_char(timezone('UTC', now()), 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"')),
  PRIMARY KEY (document_key, owner_key)
);

CREATE INDEX IF NOT EXISTS editable_tool_documents_updated_by_idx
  ON public.editable_tool_documents (updated_by);

-- Somente o servidor usa a conexão PostgreSQL privilegiada. Nenhuma tabela
-- operacional deve ficar acessível pelas chaves anon/authenticated da API.
ALTER TABLE public.users ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.clients ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.providers ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.financial_accounts ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.freight_sales ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.client_contacts ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.client_addresses ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.freight_costs ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.receivable_installments ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.payment_transactions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.import_runs ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.audit_logs ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.seller_commission_statuses ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.seller_payment_profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.sale_attachments ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.editable_tool_documents ENABLE ROW LEVEL SECURITY;

REVOKE ALL ON TABLE
  public.users,
  public.clients,
  public.providers,
  public.financial_accounts,
  public.freight_sales,
  public.client_contacts,
  public.client_addresses,
  public.freight_costs,
  public.receivable_installments,
  public.payment_transactions,
  public.import_runs,
  public.audit_logs,
  public.seller_commission_statuses,
  public.seller_payment_profiles,
  public.sale_attachments,
  public.editable_tool_documents
FROM anon, authenticated;

COMMIT;
