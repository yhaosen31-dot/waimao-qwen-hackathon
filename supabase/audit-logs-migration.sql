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

create index if not exists audit_logs_organization_id_created_at_idx
  on public.audit_logs(organization_id, created_at desc);

create index if not exists audit_logs_action_created_at_idx
  on public.audit_logs(action, created_at desc);

create index if not exists audit_logs_request_id_idx
  on public.audit_logs(request_id);

alter table public.audit_logs
  add column if not exists resource_legacy_id text;

drop trigger if exists set_audit_logs_updated_at on public.audit_logs;
create trigger set_audit_logs_updated_at
before update on public.audit_logs
for each row execute function public.set_updated_at();

alter table public.audit_logs enable row level security;

drop policy if exists "audit_logs_select_member" on public.audit_logs;
create policy "audit_logs_select_member" on public.audit_logs
for select to authenticated
using (
  exists (
    select 1 from public.organization_members member
    where member.organization_id = audit_logs.organization_id
      and member.user_id = (select auth.uid())
  )
);

drop policy if exists "audit_logs_insert_member" on public.audit_logs;
create policy "audit_logs_insert_member" on public.audit_logs
for insert to authenticated
with check (
  exists (
    select 1 from public.organization_members member
    where member.organization_id = audit_logs.organization_id
      and member.user_id = (select auth.uid())
  )
);

drop policy if exists "audit_logs_update_member" on public.audit_logs;
create policy "audit_logs_update_member" on public.audit_logs
for update to authenticated
using (
  exists (
    select 1 from public.organization_members member
    where member.organization_id = audit_logs.organization_id
      and member.user_id = (select auth.uid())
  )
)
with check (
  exists (
    select 1 from public.organization_members member
    where member.organization_id = audit_logs.organization_id
      and member.user_id = (select auth.uid())
  )
);

drop policy if exists "audit_logs_delete_member" on public.audit_logs;
create policy "audit_logs_delete_member" on public.audit_logs
for delete to authenticated
using (
  exists (
    select 1 from public.organization_members member
    where member.organization_id = audit_logs.organization_id
      and member.user_id = (select auth.uid())
  )
);
