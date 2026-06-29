-- Supabase schema for waimao-agent-platform.
-- Run this in the Supabase SQL Editor before setting DATA_STORE_PROVIDER=supabase.
-- The application still defaults to the local JSON store until Supabase is configured.

create extension if not exists pgcrypto;

create or replace function public.set_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

create table if not exists public.organizations (
  id uuid primary key default gen_random_uuid(),
  legacy_id text unique,
  name text not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  display_name text,
  email text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.organization_members (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  role text not null default 'member' check (role in ('owner', 'admin', 'member')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (organization_id, user_id)
);

create table if not exists public.import_jobs (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  legacy_id text unique,
  file_name text not null,
  file_path text not null,
  status text not null default 'uploaded' check (status in ('uploaded', 'parsed', 'mapped', 'imported', 'failed')),
  total_rows integer not null default 0,
  parsed_rows integer not null default 0,
  company_count integer not null default 0,
  deduped_company_count integer not null default 0,
  missing_company_name_count integer not null default 0,
  error_message text,
  run_id uuid,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.import_rows (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  import_job_id uuid not null references public.import_jobs(id) on delete cascade,
  legacy_id text unique,
  row_index integer not null,
  raw_data jsonb not null default '{}'::jsonb,
  company_name text,
  normalized_company_name text,
  country text,
  product_description text,
  transaction_summary text,
  source_keyword text,
  status text not null default 'parsed' check (status in ('parsed', 'ready', 'duplicate', 'needs_review', 'missing_company', 'imported', 'failed')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.column_mappings (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  import_job_id uuid not null references public.import_jobs(id) on delete cascade,
  company_name_column text,
  country_column text,
  product_description_column text,
  transaction_summary_column text,
  source_keyword_column text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (import_job_id)
);

create table if not exists public.runs (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  legacy_id text unique,
  product_input text not null,
  normalized_product text,
  target_customer_count integer not null default 0,
  status text not null default 'created' check (status in ('created', 'queued', 'running', 'waiting_review', 'paused', 'completed', 'failed', 'cancelled')),
  current_step text,
  keyword_review_status text not null default 'pending' check (keyword_review_status in ('pending', 'approved', 'rejected')),
  email_review_status text not null default 'pending' check (email_review_status in ('pending', 'approved', 'rejected')),
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

do $$
begin
  if not exists (
    select 1 from pg_constraint where conname = 'import_jobs_run_id_fkey'
  ) then
    alter table public.import_jobs
      add constraint import_jobs_run_id_fkey
      foreign key (run_id) references public.runs(id) on delete set null
      not valid;
  end if;
end $$;

create table if not exists public.run_steps (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  run_id uuid not null references public.runs(id) on delete cascade,
  legacy_id text unique,
  step_key text not null,
  step_order integer not null default 0,
  label text not null,
  status text not null default 'pending' check (status in ('pending', 'running', 'waiting_review', 'paused', 'completed', 'failed', 'skipped')),
  summary text,
  input_snapshot jsonb,
  output_snapshot jsonb,
  error_message text,
  started_at timestamptz,
  completed_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.keywords (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  run_id uuid not null references public.runs(id) on delete cascade,
  legacy_id text unique,
  value text not null,
  language text not null default 'en',
  source text not null default 'llm' check (source in ('mock', 'llm', 'manual')),
  status text not null default 'pending' check (status in ('pending', 'approved', 'rejected')),
  confidence numeric,
  reason text,
  evidence_ids uuid[] not null default '{}',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.search_query_logs (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  company_id uuid,
  import_job_id uuid references public.import_jobs(id) on delete set null,
  query text not null,
  search_type text not null check (search_type in ('website', 'email', 'phone', 'whatsapp', 'social', 'contact')),
  mode text not null default 'fallback' check (mode in ('economy', 'fallback', 'deep_verify')),
  provider text check (provider in ('exa', 'tavily', 'you', 'mock')),
  status text not null check (status in ('success', 'failed', 'fallback', 'skipped')),
  result_count integer not null default 0,
  average_confidence numeric,
  fallback_reason text,
  error_message text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.search_provider_usage (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  provider text not null check (provider in ('exa', 'tavily', 'you', 'mock')),
  total_queries integer not null default 0,
  successful_queries integer not null default 0,
  failed_queries integer not null default 0,
  fallback_count integer not null default 0,
  last_used_at timestamptz,
  last_error text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (organization_id, provider)
);

create table if not exists public.companies (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  run_id uuid references public.runs(id) on delete set null,
  import_job_id uuid references public.import_jobs(id) on delete set null,
  legacy_id text unique,
  name text not null,
  legal_name text,
  normalized_name text,
  country text,
  city text,
  website text,
  domain text,
  industry text,
  products text[] not null default '{}',
  importer_profile text,
  buyer_fit jsonb,
  buyer_fit_score integer,
  buyer_fit_tier text check (buyer_fit_tier in ('high', 'medium', 'low', 'unknown')),
  company_role text check (company_role in ('importer', 'distributor', 'trading_company', 'manufacturer', 'end_user', 'unknown')),
  buyer_fit_reasons text[] not null default '{}',
  buyer_fit_risks text[] not null default '{}',
  lead_score integer,
  confidence numeric,
  suggested_action text check (suggested_action in ('email_first', 'whatsapp_first', 'manual_review', 'skip')),
  source_keyword text,
  source_query text,
  source_provider text check (source_provider in ('exa', 'tavily', 'you', 'mock')),
  product_description text,
  transaction_summary text,
  enrichment_status text default 'pending' check (enrichment_status in ('pending', 'running', 'completed', 'failed', 'needs_review')),
  website_status text default 'not_started' check (website_status in ('not_started', 'found', 'not_found', 'needs_review')),
  contact_status text default 'not_started' check (contact_status in ('not_started', 'found', 'not_found', 'partial', 'needs_review')),
  contact_confidence integer,
  primary_website text,
  recommended_emails text[] not null default '{}',
  recommended_phone text,
  recommended_whatsapp text,
  recommended_social_links jsonb not null default '{}'::jsonb,
  evidence_summary text,
  enrichment_logs jsonb not null default '[]'::jsonb,
  status text not null default 'new' check (status in ('new', 'imported_candidate', 'product_search_candidate', 'enriched', 'scored', 'drafted', 'email_approved', 'email_skipped', 'contacted', 'replied', 'invalid', 'blacklist', 'saved_to_crm')),
  source text not null check (source in ('excel_import', 'product_search', 'manual', 'cross_search_legacy')),
  evidence_ids uuid[] not null default '{}',
  email_draft_ids uuid[] not null default '{}',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

do $$
begin
  if not exists (
    select 1 from pg_constraint where conname = 'search_query_logs_company_id_fkey'
  ) then
    alter table public.search_query_logs
      add constraint search_query_logs_company_id_fkey
      foreign key (company_id) references public.companies(id) on delete set null
      not valid;
  end if;
end $$;

create table if not exists public.contacts (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  run_id uuid references public.runs(id) on delete set null,
  company_id uuid not null references public.companies(id) on delete cascade,
  legacy_id text unique,
  full_name text not null,
  title text,
  department text,
  source text not null,
  confidence numeric,
  evidence_ids uuid[] not null default '{}',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.company_emails (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  run_id uuid references public.runs(id) on delete set null,
  company_id uuid not null references public.companies(id) on delete cascade,
  contact_id uuid references public.contacts(id) on delete set null,
  legacy_id text unique,
  email text not null,
  domain text,
  source text not null,
  confidence numeric,
  verification_status text not null default 'unverified' check (verification_status in ('unverified', 'valid', 'invalid', 'risky')),
  evidence_ids uuid[] not null default '{}',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.company_phones (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  run_id uuid references public.runs(id) on delete set null,
  company_id uuid not null references public.companies(id) on delete cascade,
  contact_id uuid references public.contacts(id) on delete set null,
  legacy_id text unique,
  phone_type text not null default 'phone' check (phone_type in ('phone', 'whatsapp')),
  number text not null,
  country_code text,
  source text not null,
  confidence numeric,
  evidence_ids uuid[] not null default '{}',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.company_social_links (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  company_id uuid not null references public.companies(id) on delete cascade,
  social_type text not null check (social_type in ('linkedin', 'facebook', 'website', 'other')),
  url text not null,
  source text,
  confidence numeric,
  evidence_ids uuid[] not null default '{}',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.evidence (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  run_id uuid references public.runs(id) on delete set null,
  company_id uuid references public.companies(id) on delete cascade,
  contact_id uuid references public.contacts(id) on delete set null,
  legacy_id text unique,
  provider text not null,
  source_provider text check (source_provider in ('exa', 'tavily', 'you', 'mock')),
  type text not null,
  source text,
  title text,
  url text,
  snippet text,
  raw_text text,
  confidence numeric,
  raw_json jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.email_drafts (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  run_id uuid references public.runs(id) on delete set null,
  company_id uuid not null references public.companies(id) on delete cascade,
  contact_id uuid references public.contacts(id) on delete set null,
  to_email_address_id uuid references public.company_emails(id) on delete set null,
  legacy_id text unique,
  to_email text,
  subject text not null,
  body text not null,
  status text not null default 'draft' check (status in ('draft', 'waiting_review', 'approved', 'skipped', 'saved', 'sent', 'failed')),
  used_evidence_ids uuid[] not null default '{}',
  style_notes text[] not null default '{}',
  approved_at timestamptz,
  skipped_at timestamptz,
  sent_at timestamptz,
  edited_at timestamptz,
  error_message text,
  provider text not null default 'mock' check (provider in ('mock', 'resend', 'smtp')),
  personalization_notes text[] not null default '{}',
  evidence_ids uuid[] not null default '{}',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.email_logs (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  run_id uuid references public.runs(id) on delete set null,
  email_draft_id uuid references public.email_drafts(id) on delete set null,
  company_id uuid references public.companies(id) on delete cascade,
  legacy_id text unique,
  provider text not null check (provider in ('mock', 'resend', 'smtp')),
  action text not null default 'send' check (action in ('save_draft', 'send')),
  status text not null check (status in ('mock_sent', 'sent', 'failed', 'success', 'skipped')),
  to_email text,
  from_email text,
  subject text,
  provider_message_id text,
  error_message text,
  attempted_at timestamptz not null default now(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.audit_logs (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  legacy_id text unique,
  actor_type text not null default 'anonymous' check (actor_type in ('anonymous', 'user', 'system', 'worker')),
  actor_id text,
  action text not null,
  resource_type text not null,
  resource_id uuid,
  resource_legacy_id text,
  status text not null check (status in ('success', 'failure', 'blocked')),
  ip_address text,
  user_agent text,
  request_id text,
  metadata jsonb not null default '{}'::jsonb,
  error_message text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.company_notes (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  company_id uuid not null references public.companies(id) on delete cascade,
  legacy_id text unique,
  content text not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists import_rows_import_job_id_idx on public.import_rows(import_job_id);
create index if not exists companies_run_id_idx on public.companies(run_id);
create index if not exists companies_import_job_id_idx on public.companies(import_job_id);
create index if not exists contacts_run_id_idx on public.contacts(run_id);
create index if not exists contacts_company_id_idx on public.contacts(company_id);
create index if not exists company_emails_run_id_idx on public.company_emails(run_id);
create index if not exists company_emails_company_id_idx on public.company_emails(company_id);
create index if not exists company_phones_run_id_idx on public.company_phones(run_id);
create index if not exists company_phones_company_id_idx on public.company_phones(company_id);
create index if not exists evidence_run_id_idx on public.evidence(run_id);
create index if not exists run_steps_run_id_idx on public.run_steps(run_id);
create index if not exists organization_members_user_id_idx on public.organization_members(user_id);
create index if not exists organization_members_organization_id_idx on public.organization_members(organization_id);
create index if not exists companies_organization_id_source_idx on public.companies(organization_id, source);
create index if not exists companies_organization_id_status_idx on public.companies(organization_id, status);
create index if not exists evidence_company_id_idx on public.evidence(company_id);
create index if not exists email_drafts_run_id_idx on public.email_drafts(run_id);
create index if not exists email_drafts_company_id_idx on public.email_drafts(company_id);
create index if not exists email_logs_run_id_idx on public.email_logs(run_id);
create index if not exists email_logs_company_id_idx on public.email_logs(company_id);
create index if not exists search_query_logs_import_job_id_idx on public.search_query_logs(import_job_id);
create index if not exists search_query_logs_company_id_idx on public.search_query_logs(company_id);
create index if not exists audit_logs_organization_id_created_at_idx on public.audit_logs(organization_id, created_at desc);
create index if not exists audit_logs_action_created_at_idx on public.audit_logs(action, created_at desc);
create index if not exists audit_logs_request_id_idx on public.audit_logs(request_id);

do $$
declare
  table_name text;
begin
  foreach table_name in array array[
    'organizations',
    'profiles',
    'organization_members',
    'import_jobs',
    'import_rows',
    'column_mappings',
    'runs',
    'run_steps',
    'keywords',
    'search_query_logs',
    'search_provider_usage',
    'companies',
    'contacts',
    'company_emails',
    'company_phones',
    'company_social_links',
    'evidence',
    'email_drafts',
    'email_logs',
    'audit_logs',
    'company_notes'
  ]
  loop
    execute format('drop trigger if exists set_%I_updated_at on public.%I', table_name, table_name);
    execute format('create trigger set_%I_updated_at before update on public.%I for each row execute function public.set_updated_at()', table_name, table_name);
  end loop;
end $$;

alter table public.organizations enable row level security;
alter table public.profiles enable row level security;
alter table public.organization_members enable row level security;
alter table public.import_jobs enable row level security;
alter table public.import_rows enable row level security;
alter table public.column_mappings enable row level security;
alter table public.runs enable row level security;
alter table public.run_steps enable row level security;
alter table public.keywords enable row level security;
alter table public.search_query_logs enable row level security;
alter table public.search_provider_usage enable row level security;
alter table public.companies enable row level security;
alter table public.contacts enable row level security;
alter table public.company_emails enable row level security;
alter table public.company_phones enable row level security;
alter table public.company_social_links enable row level security;
alter table public.evidence enable row level security;
alter table public.email_drafts enable row level security;
alter table public.email_logs enable row level security;
alter table public.audit_logs enable row level security;
alter table public.company_notes enable row level security;

-- Explicit Data API grants. RLS still controls row-level access for authenticated users.
grant usage on schema public to authenticated, service_role;
grant select on public.organizations to authenticated;
grant select on public.organization_members to authenticated;
grant select, update on public.profiles to authenticated;
grant all privileges on all tables in schema public to service_role;
grant usage, select on all sequences in schema public to authenticated, service_role;

do $$
declare
  table_name text;
begin
  foreach table_name in array array[
    'import_jobs',
    'import_rows',
    'column_mappings',
    'runs',
    'run_steps',
    'keywords',
    'search_query_logs',
    'search_provider_usage',
    'companies',
    'contacts',
    'company_emails',
    'company_phones',
    'company_social_links',
    'evidence',
    'email_drafts',
    'email_logs',
    'audit_logs',
    'company_notes'
  ]
  loop
    execute format('grant select, insert, update, delete on public.%I to authenticated', table_name);
  end loop;
end $$;

-- RLS policies for authenticated users. The server-side app uses service_role and
-- bypasses RLS; these policies are ready for a future login/multi-user phase.
drop policy if exists "profiles_select_own" on public.profiles;
create policy "profiles_select_own" on public.profiles
for select to authenticated
using ((select auth.uid()) = id);

drop policy if exists "profiles_update_own" on public.profiles;
create policy "profiles_update_own" on public.profiles
for update to authenticated
using ((select auth.uid()) = id)
with check ((select auth.uid()) = id);

drop policy if exists "organization_members_select_own_orgs" on public.organization_members;
create policy "organization_members_select_own_orgs" on public.organization_members
for select to authenticated
using (user_id = (select auth.uid()));

drop policy if exists "organizations_select_member" on public.organizations;
create policy "organizations_select_member" on public.organizations
for select to authenticated
using (
  exists (
    select 1 from public.organization_members member
    where member.organization_id = organizations.id
      and member.user_id = (select auth.uid())
  )
);

-- Shared organization policy template applied to business tables.
do $$
declare
  table_name text;
begin
  foreach table_name in array array[
    'import_jobs',
    'import_rows',
    'column_mappings',
    'runs',
    'run_steps',
    'keywords',
    'search_query_logs',
    'search_provider_usage',
    'companies',
    'contacts',
    'company_emails',
    'company_phones',
    'company_social_links',
    'evidence',
    'email_drafts',
    'email_logs',
    'audit_logs',
    'company_notes'
  ]
  loop
    execute format('drop policy if exists "%s_select_member" on public.%I', table_name, table_name);
    execute format(
      'create policy "%s_select_member" on public.%I for select to authenticated using (exists (select 1 from public.organization_members member where member.organization_id = %I.organization_id and member.user_id = (select auth.uid())))',
      table_name,
      table_name,
      table_name
    );

    execute format('drop policy if exists "%s_insert_member" on public.%I', table_name, table_name);
    execute format(
      'create policy "%s_insert_member" on public.%I for insert to authenticated with check (exists (select 1 from public.organization_members member where member.organization_id = %I.organization_id and member.user_id = (select auth.uid())))',
      table_name,
      table_name,
      table_name
    );

    execute format('drop policy if exists "%s_update_member" on public.%I', table_name, table_name);
    execute format(
      'create policy "%s_update_member" on public.%I for update to authenticated using (exists (select 1 from public.organization_members member where member.organization_id = %I.organization_id and member.user_id = (select auth.uid()))) with check (exists (select 1 from public.organization_members member where member.organization_id = %I.organization_id and member.user_id = (select auth.uid())))',
      table_name,
      table_name,
      table_name,
      table_name
    );

    execute format('drop policy if exists "%s_delete_member" on public.%I', table_name, table_name);
    execute format(
      'create policy "%s_delete_member" on public.%I for delete to authenticated using (exists (select 1 from public.organization_members member where member.organization_id = %I.organization_id and member.user_id = (select auth.uid())))',
      table_name,
      table_name,
      table_name
    );
  end loop;
end $$;

insert into storage.buckets (id, name, public)
values ('imports', 'imports', false)
on conflict (id) do update set public = false;

drop policy if exists "imports_objects_select_member" on storage.objects;
create policy "imports_objects_select_member" on storage.objects
for select to authenticated
using (
  bucket_id = 'imports'
  and exists (
    select 1 from public.organization_members member
    where member.user_id = (select auth.uid())
      and name like ('organizations/' || member.organization_id::text || '/%')
  )
);

drop policy if exists "imports_objects_insert_member" on storage.objects;
create policy "imports_objects_insert_member" on storage.objects
for insert to authenticated
with check (
  bucket_id = 'imports'
  and exists (
    select 1 from public.organization_members member
    where member.user_id = (select auth.uid())
      and name like ('organizations/' || member.organization_id::text || '/%')
  )
);

drop policy if exists "imports_objects_update_member" on storage.objects;
create policy "imports_objects_update_member" on storage.objects
for update to authenticated
using (
  bucket_id = 'imports'
  and exists (
    select 1 from public.organization_members member
    where member.user_id = (select auth.uid())
      and name like ('organizations/' || member.organization_id::text || '/%')
  )
)
with check (
  bucket_id = 'imports'
  and exists (
    select 1 from public.organization_members member
    where member.user_id = (select auth.uid())
      and name like ('organizations/' || member.organization_id::text || '/%')
  )
);
