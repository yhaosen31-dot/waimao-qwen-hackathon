-- Auth and RLS hardening for existing Supabase projects.
-- Run this after supabase/schema.sql if the schema was created before login protection was added.

create index if not exists organization_members_user_id_idx on public.organization_members(user_id);
create index if not exists organization_members_organization_id_idx on public.organization_members(organization_id);

alter table public.organizations enable row level security;
alter table public.profiles enable row level security;
alter table public.organization_members enable row level security;

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
    select 1
    from public.organization_members member
    where member.organization_id = organizations.id
      and member.user_id = (select auth.uid())
  )
);
