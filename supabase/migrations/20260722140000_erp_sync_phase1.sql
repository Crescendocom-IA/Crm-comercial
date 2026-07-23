-- Fase 1 da integração ERP -> FlowCRM: só o lado do CRM.
-- O ERP (Firebird) e o n8n entram depois; aqui preparamos o destino.

-- ── Rastreio de origem ──────────────────────────────────────────────────────
alter table contacts add column if not exists codigo_erp text;
alter table contacts add column if not exists sync_source text default 'crm';
alter table contacts add column if not exists synced_at timestamptz;

alter table companies add column if not exists codigo_erp text;
alter table companies add column if not exists sync_source text default 'crm';
alter table companies add column if not exists synced_at timestamptz;

-- ── Campos do payload que não tinham destino ────────────────────────────────
-- cnpj_cpf, cidade e estado vêm no payload do ERP mas não existiam em nenhuma
-- das duas tabelas. Sem estas colunas a edge function descartaria os valores em
-- silêncio — o pior tipo de perda de dado, porque o sync reportaria sucesso.
alter table contacts add column if not exists cnpj_cpf text;
alter table contacts add column if not exists cidade text;
alter table contacts add column if not exists estado text;

alter table companies add column if not exists cnpj_cpf text;
alter table companies add column if not exists cidade text;
alter table companies add column if not exists estado text;

-- ── Chave de upsert idempotente ─────────────────────────────────────────────
-- Único POR ORG: o mesmo código do ERP pode existir em organizações
-- diferentes sem colidir. O WHERE deixa fora os registros nascidos no CRM,
-- que têm codigo_erp nulo e não devem disputar unicidade entre si.
create unique index if not exists contacts_codigo_erp_org_idx
  on contacts (org_id, codigo_erp) where codigo_erp is not null;
create unique index if not exists companies_codigo_erp_org_idx
  on companies (org_id, codigo_erp) where codigo_erp is not null;

-- ── Log de sync ─────────────────────────────────────────────────────────────
create table if not exists erp_sync_log (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references organizations(id) on delete cascade,
  entity_type text not null,   -- 'contact', 'company', 'product', 'deal'
  operation text not null,     -- 'insert', 'update', 'skip', 'error'
  codigo_erp text,
  entity_id uuid,
  error_message text,
  payload jsonb,
  created_at timestamptz default now()
);

create index if not exists erp_sync_log_org_idx on erp_sync_log(org_id, created_at desc);

alter table erp_sync_log enable row level security;

-- Só SELECT: quem escreve é a edge function com a service role, que ignora RLS.
--
-- Usa user_belongs_to_org() em vez de subconsulta direta em user_roles: o
-- helper é SECURITY DEFINER, e uma subconsulta comum aqui passaria pela própria
-- RLS de user_roles — que está habilitada — podendo devolver vazio. É também o
-- padrão que o resto do schema já segue.
drop policy if exists "erp_sync_log_select_org" on erp_sync_log;
create policy "erp_sync_log_select_org" on erp_sync_log for select to authenticated
  using (user_belongs_to_org(auth.uid(), org_id));
